const { getPlans, createSubscription, renewSubscription, freezeSubscription, unfreezeSubscription, upgradeSubscription, purchaseTraffic, getSubscriptionStatus, getDevices, getConnectionRequests, deleteDevice } = require('./adaptgroup.js');
const { Redis } = require('@upstash/redis');
const redis = new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });

module.exports = async function handler(req, res) {
  const { pathname } = new URL(req.url);
  
  try {
    // GET /api/vpn/plans
    if (req.method === 'GET' && pathname === '/api/vpn/plans') {
      const plans = await getPlans();
      return res.json({ success: true, plans });
    }
    
    // GET /api/vpn/status?uuid=...
    if (req.method === 'GET' && pathname === '/api/vpn/status') {
      const uuid = req.query?.uuid;
      if (!uuid) return res.status(400).json({ error: 'uuid required' });
      const status = await getSubscriptionStatus(uuid);
      return res.json({ success: true, ...status });
    }
    
    // GET /api/vpn/devices?uuid=...
    if (req.method === 'GET' && pathname === '/api/vpn/devices') {
      const uuid = req.query?.uuid;
      if (!uuid) return res.status(400).json({ error: 'uuid required' });
      const devices = await getDevices(uuid);
      return res.json({ success: true, devices });
    }
    
    // POST /api/vpn/subscribe
    if (req.method === 'POST' && pathname === '/api/vpn/subscribe') {
      const { plan_uuid, external_user_id } = req.body;
      const result = await createSubscription(plan_uuid, external_user_id);
      return res.json({ success: true, ...result });
    }
    
    // POST /api/vpn/renew
    if (req.method === 'POST' && pathname === '/api/vpn/renew') {
      const { uuid } = req.body;
      const result = await renewSubscription(uuid);
      return res.json({ success: true, ...result });
    }
    
    // POST /api/vpn/freeze
    if (req.method === 'POST' && pathname === '/api/vpn/freeze') {
      const { uuid } = req.body;
      const result = await freezeSubscription(uuid);
      return res.json({ success: true, ...result });
    }
    
    // POST /api/vpn/unfreeze
    if (req.method === 'POST' && pathname === '/api/vpn/unfreeze') {
      const { uuid } = req.body;
      const result = await unfreezeSubscription(uuid);
      return res.json({ success: true, ...result });
    }
    
    // POST /api/vpn/upgrade
    if (req.method === 'POST' && pathname === '/api/vpn/upgrade') {
      const { uuid, new_plan_uuid } = req.body;
      const result = await upgradeSubscription(uuid, new_plan_uuid);
      return res.json({ success: true, ...result });
    }
    
    // POST /api/vpn/traffic
    if (req.method === 'POST' && pathname === '/api/vpn/traffic') {
      const { uuid, gb } = req.body;
      const result = await purchaseTraffic(uuid, gb);
      return res.json({ success: true, ...result });
    }
    
    // POST /api/vpn/devices-delete
    if (req.method === 'POST' && pathname === '/api/vpn/devices-delete') {
      const { uuid, device_id } = req.body;
      const result = await deleteDevice(uuid, device_id);
      return res.json({ success: true, ...result });
    }
    
    return res.status(404).json({ error: 'Not found' });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
