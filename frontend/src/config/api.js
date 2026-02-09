// ⚡ CHANGE THIS LINE TO SET YOUR BACKEND URL ⚡
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5254/api'; // Change '/api' to 'http://localhost:3060/api' for development
// export const API_BASE_URL = process.env.REACT_APP_API_URL || '/api'; 

// API Endpoints
export const API_ENDPOINTS = {
  // Categories
  CATEGORIES: `${API_BASE_URL}/categories`,
  
  // Leads
  LEADS: `${API_BASE_URL}/leads`,
  LEAD_REACHED: (leadId) => `${API_BASE_URL}/leads/${leadId}/reached`,
  
  // Search
  SEARCH: `${API_BASE_URL}/search`,
  LAST_SEARCH: `${API_BASE_URL}/last-search`,
  
  // Analytics
  ANALYTICS: `${API_BASE_URL}/analytics`,
  
  // Messages
  MESSAGES: `${API_BASE_URL}/messages`,
  
  // WhatsApp
  WHATSAPP_STATUS: `${API_BASE_URL}/whatsapp/status`,
  WHATSAPP_ACCOUNT: `${API_BASE_URL}/whatsapp/account`,
  WHATSAPP_DISCONNECT: `${API_BASE_URL}/whatsapp/disconnect`,
  WHATSAPP_SEND_MESSAGES: `${API_BASE_URL}/whatsapp/send-messages`,
  
  // Greeting
  GREETING: `${API_BASE_URL}/greeting`,
  
  // Google Sheets
  GOOGLE_SHEETS_SAVE: `${API_BASE_URL}/google-sheets/save`,
  
  // Rate Limit
  RATE_LIMIT_STATUS: `${API_BASE_URL}/rate-limit/status`,
};

export default API_ENDPOINTS;

