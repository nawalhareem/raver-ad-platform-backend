import prisma from '../../db/prisma';
import { createNotification } from '../notification/service';

const isValidCampaignId = (id: string) => {
  return typeof id === 'string' && id.length > 0;
};

export const getAllCampaigns = async (userId?: string) => {
  try {
    const where: any = {};
    if (userId) where.userId = userId;
    
    return await prisma.campaign.findMany({
      where,
      include: { metrics: true },
      orderBy: { createdAt: 'desc' }
    });
  } catch (error) {
    console.error('Error fetching campaigns:', error);
    throw new Error('Could not retrieve campaigns from database.');
  }
};

export const getCampaignById = async (id: string) => {
  if (!isValidCampaignId(id)) return null;
  try {
    return await prisma.campaign.findUnique({
      where: { id },
      include: { metrics: true }
    });
  } catch (error) {
    console.error(`Error fetching campaign by ID (${id}):`, error);
    throw new Error('Could not retrieve campaign from database.');
  }
};

export const createCampaign = async (data: any) => {
  // Map singular 'platform' to 'platforms' array if needed
  let platforms = data.platforms || [];
  if (data.platform && platforms.length === 0) {
    platforms = [data.platform];
  }

  try {
    const campaign = await prisma.campaign.create({
      data: {
        userId: data.userId,
        projectId: data.projectId,
        name: data.name,
        objective: data.objective || data.config?.objective,
        audience: data.audience || data.config?.audience,
        visualStyles: data.visualStyles || data.config?.visualStyles || [],
        tones: data.tones || data.config?.tones || [],
        colorScheme: data.colorScheme || data.config?.colorScheme,
        platforms: platforms.length > 0 ? platforms : (data.config?.platforms || []),
        duration: data.duration || data.config?.duration,
        format: data.format || data.config?.format,
        budget: Math.max(0, Number(data.budget) || 0),
        startDate: data.startDate ? new Date(data.startDate) : null,
        endDate: data.endDate ? new Date(data.endDate) : null,
        status: "draft",
        config: data.config
      }
    });

    // Trigger notification
    await createNotification({
      userId: data.userId,
      type: 'CAMPAIGN_CREATED',
      title: 'New Campaign Created',
      message: `Your campaign "${campaign.name}" has been successfully created as a draft.`,
      metadata: { campaignId: campaign.id, campaignName: campaign.name }
    });

    return campaign;
  } catch (error) {
    console.error('Error creating campaign:', error);
    throw new Error('Campaign creation failed.');
  }
};

export const updateCampaign = async (id: string, data: any) => {
  if (!isValidCampaignId(id)) throw new Error('Invalid Campaign ID format');
  try {
    const updateData = { ...data };
    if (updateData.budget !== undefined) {
      updateData.budget = Math.max(0, Number(updateData.budget) || 0);
    }

    const campaign = await prisma.campaign.update({
      where: { id },
      data: updateData
    });

    // Trigger notification
    await createNotification({
      userId: campaign.userId,
      type: 'CAMPAIGN_UPDATED',
      title: 'Campaign Updated',
      message: `The campaign "${campaign.name}" has been updated.`,
      metadata: { campaignId: campaign.id, campaignName: campaign.name }
    });

    return campaign;
  } catch (error) {
    console.error(`Error updating campaign ID (${id}):`, error);
    throw new Error('Campaign update failed.');
  }
};

export const deleteCampaign = async (id: string) => {
  if (!isValidCampaignId(id)) throw new Error('Invalid Campaign ID format');
  try {
    // Fetch campaign details before deletion for notification
    const campaign = await prisma.campaign.findUnique({ where: { id } });

    if (campaign) {
      await createNotification({
        userId: campaign.userId,
        type: 'CAMPAIGN_DELETED',
        title: 'Campaign Deleted',
        message: `The campaign "${campaign.name}" and all its associated assets have been deleted.`,
        link: `https://adplatform.raver.ai/dashboard/projects`,
        metadata: { campaignId: id, campaignName: campaign.name }
      });
    }

    // 1. Manually clean up associated records that don't have automatic Cascade Delete
    
    // Delete metrics (Prisma should handle this, but being explicit doesn't hurt)
    await prisma.metric.deleteMany({ where: { campaignId: id } });

    // Delete associated assets
    await prisma.asset.deleteMany({ where: { campaignId: id } });

    // Delete image lead results
    await prisma.imageLeadResult.deleteMany({ where: { campaignId: id } });

    // Delete other agent results
    await (prisma as any).producerResult.deleteMany({ where: { campaignId: id } });
    await (prisma as any).audioLeadResult.deleteMany({ where: { campaignId: id } });
    await (prisma as any).copyLeadResult.deleteMany({ where: { campaignId: id } });
    await (prisma as any).editorResult.deleteMany({ where: { campaignId: id } });

    // 1. Hard-delete AI Director sessions associated with this campaign.
    // This ensures the sessions are actually removed from the database.
    await (prisma as any).aISession.deleteMany({
      where: {
        OR: [
          { campaignId: id },
          { sessionId: id },
          { sessionId: { startsWith: id } }
        ]
      }
    });

    // 2. Finally, delete the campaign itself
    return await prisma.campaign.deleteMany({
      where: { id }
    });
  } catch (error: any) {
    console.error(`Error deleting campaign ID (${id}):`, error);
    throw new Error('Campaign deletion failed.');
  }
};
