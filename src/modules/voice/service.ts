import axios from 'axios';

const ELEVEN_LABS_API_URL = 'https://api.elevenlabs.io/v1/voices';
const DEFAULT_RAVER_VOICE_ID = 'EXAVITQu4vr4xnSDxMaL';

const elevenLabsKey = () =>
  process.env.ELEVEN_LABS_API_KEY || process.env.ELEVENLABS_API_KEY || '';

const aiBackendUrl = () =>
  (process.env.AI_BACKEND_URL || 'https://apiplatform.raver.ai').replace(/\/$/, '');

const isVoiceNotFound = (error: any) => {
  const raw = error?.response?.data;
  let body = '';
  if (Buffer.isBuffer(raw)) body = raw.toString('utf8');
  else if (typeof raw === 'string') body = raw;
  else if (raw) body = JSON.stringify(raw);
  return error?.response?.status === 404 || body.includes('voice_not_found');
};

export const fetchElevenLabsVoices = async () => {
  try {
    const response = await axios.get(ELEVEN_LABS_API_URL, {
      headers: {
        'Accept': 'application/json',
        'xi-api-key': elevenLabsKey(),
      },
    });

    return response.data.voices;
  } catch (error: any) {
    console.error('Error fetching voices from ElevenLabs:', error.message);
    throw new Error('Failed to retrieve voices from ElevenLabs.');
  }
};

export const fetchElevenLabsVoice = async (voiceId: string) => {
  try {
    const response = await axios.get(`${ELEVEN_LABS_API_URL}/${voiceId}`, {
      headers: {
        'Accept': 'application/json',
        'xi-api-key': elevenLabsKey(),
      },
    });

    return response.data;
  } catch (error: any) {
    console.error('Error fetching voice from ElevenLabs:', error.message);
    throw new Error('Failed to retrieve voice from ElevenLabs.');
  }
};

const callElevenLabsTTS = async (voiceId: string, text: string, apiKey: string) => {
  const response = await axios.post(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.5 },
    },
    {
      headers: {
        Accept: 'audio/mpeg',
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      responseType: 'arraybuffer',
    }
  );
  return response.data;
};

const generateTtsViaVideo = async (voiceId: string, text: string) => {
  const response = await axios.post(
    `${aiBackendUrl()}/api/voice/generate-tts`,
    { text, voice_id: voiceId },
    {
      headers: { 'Content-Type': 'application/json' },
      responseType: 'arraybuffer',
      timeout: 60000,
      validateStatus: () => true,
    }
  );
  const ctype = String(response.headers['content-type'] || '');
  if (response.status >= 200 && response.status < 300 && ctype.includes('audio')) {
    return response.data;
  }
  const errBody = Buffer.isBuffer(response.data)
    ? response.data.toString('utf8').slice(0, 300)
    : String(response.data || '').slice(0, 300);
  throw new Error(`Video TTS failed (${response.status}): ${errBody}`);
};

export const generateElevenLabsTTS = async (voiceId: string, text: string) => {
  const apiKey = elevenLabsKey();
  const requested = voiceId || DEFAULT_RAVER_VOICE_ID;

  const tryDirect = async () => {
    try {
      return await callElevenLabsTTS(requested, text, apiKey);
    } catch (error: any) {
      if (isVoiceNotFound(error) && requested !== DEFAULT_RAVER_VOICE_ID) {
        console.warn(`[TTS] Voice ${requested} missing; falling back to ${DEFAULT_RAVER_VOICE_ID}`);
        return await callElevenLabsTTS(DEFAULT_RAVER_VOICE_ID, text, apiKey);
      }
      throw error;
    }
  };

  try {
    if (apiKey) {
      try {
        return await tryDirect();
      } catch (error: any) {
        const status = error?.response?.status;
        const raw = error?.response?.data;
        let body = '';
        if (Buffer.isBuffer(raw)) body = raw.toString('utf8');
        else if (typeof raw === 'string') body = raw;
        else if (raw) body = JSON.stringify(raw);
        if (
          status === 401 ||
          status === 403 ||
          body.includes('invalid_api_key') ||
          body.includes('api_key_id_used')
        ) {
          console.warn('[TTS] ElevenLabs key rejected; proxying to Video API');
          return await generateTtsViaVideo(requested, text);
        }
        throw error;
      }
    }
    console.warn('[TTS] No ElevenLabs key on Node; proxying to Video API');
    return await generateTtsViaVideo(requested, text);
  } catch (error: any) {
    console.error('Error generating TTS from ElevenLabs:', error.response?.data?.toString() || error.message);
    let errorDetails = 'Failed to generate TTS from ElevenLabs.';
    if (error.response?.data) {
      try {
        const dataStr = Buffer.from(error.response.data).toString('utf8');
        errorDetails += ' ' + dataStr;
        console.error('ElevenLabs response body:', dataStr);
      } catch (e) {
        // ignore
      }
    } else if (error.message) {
      errorDetails += ' ' + error.message;
    }
    throw new Error(errorDetails);
  }
};
