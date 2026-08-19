import axios, { AxiosError } from 'axios';

const BASE_URL = (process.env.AI_BACKEND_URL || 'https://apiplatform.raver.ai').replace(/\/$/, '');

/**
 * Generic proxy helper for forwarding requests to the external AI backend.
 * Used by all AI proxy modules (ads, chat, image-lead, audio-lead, etc.)
 */
export const proxyPost = async (path: string, body: any) => {
  const fullUrl = `${BASE_URL}${path}`;
  try {
    const payload = body || {}; 
    
    const headers: any = {};
    if (!(payload instanceof FormData)) {
      headers['Content-Type'] = 'application/json';
    }

    const response = await axios.post(fullUrl, payload, {
      headers,
      timeout: Number(process.env.API_TIMEOUT) || 600000, 
    });
    console.log(`[AIProxy] POST response from ${fullUrl}:`, JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    const axiosErr = error as AxiosError;
    if (axiosErr.response) {
      const data = axiosErr.response.data as any;
      console.error(`[AIProxy] POST error from ${fullUrl}:`, JSON.stringify(data));
      if (Array.isArray(data?.detail)) {
        throw { status: axiosErr.response.status, message: data.detail.map((e: any) => `${e.loc?.join('.') || ''} - ${e.msg}`).join(', '), data };
      }
      throw { status: axiosErr.response.status, message: JSON.stringify(data), data };
    }
    // console.error(`[AIProxy] Failed to reach AI backend ${path}:`, axiosErr.message);
    throw { status: 503, message: 'Failed to communicate with AI service' };
  }
};

export const proxyGet = async (path: string) => {
  const fullUrl = `${BASE_URL}${path}`;
  try {
    const response = await axios.get(fullUrl, {
      timeout: 30000,
    });
    console.log(`[AIProxy] Received successful response from ${fullUrl}:`, JSON.stringify(response.data));
    return response.data;
  } catch (error) {
    const axiosErr = error as AxiosError;
    if (axiosErr.response) {
      const data = axiosErr.response.data as any;
      // console.error(`[AIProxy] Error from AI backend ${fullUrl}:`, JSON.stringify(data, null, 2));
      throw { status: axiosErr.response.status, message: JSON.stringify(data), data };
    }
    // console.error(`[AIProxy] Failed to reach AI backend ${fullUrl}:`, axiosErr.message);
    throw { status: 503, message: 'Failed to communicate with AI service' };
  }
};

export const proxyDelete = async (path: string) => {
  const fullUrl = `${BASE_URL}${path}`;
  try {
    const response = await axios.delete(fullUrl, {
      timeout: 30000,
    });
    return response.data;
  } catch (error) {
    const axiosErr = error as AxiosError;
    if (axiosErr.response) {
      const data = axiosErr.response.data as any;
      throw { status: axiosErr.response.status, message: JSON.stringify(data), data };
    }
    throw { status: 503, message: 'Failed to communicate with AI service' };
  }
};
