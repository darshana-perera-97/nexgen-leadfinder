require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const { google } = require('googleapis');
const app = express();
const PORT = process.env.PORT || 5254;

// Middleware
app.use(cors());
app.use(express.json());

// Define build path for React app
const buildPath = path.join(__dirname, '..', 'frontend', 'build');

const charactersFilePath = path.join(__dirname, 'data', 'characters.json');
const categoryFilePath = path.join(__dirname, 'data', 'category.json');
const leadsFilePath = path.join(__dirname, 'data', 'leads.json');
const analyticsFilePath = path.join(__dirname, 'data', 'analytics.json');
const lastSearchResultsFilePath = path.join(__dirname, 'data', 'lastSearchResults.json');
const messagesFilePath = path.join(__dirname, 'data', 'messages.json');
const rateLimitFilePath = path.join(__dirname, 'data', 'rateLimit.json');

// Helper function to read characters
const readCharacters = () => {
  try {
    const data = fs.readFileSync(charactersFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

// Helper function to write characters
const writeCharacters = (characters) => {
  fs.writeFileSync(charactersFilePath, JSON.stringify(characters, null, 2));
};

// Helper function to read categories
const readCategories = () => {
  try {
    const data = fs.readFileSync(categoryFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

// Helper function to write categories
const writeCategories = (categories) => {
  fs.writeFileSync(categoryFilePath, JSON.stringify(categories, null, 2));
};

// Helper function to read leads
const readLeads = () => {
  try {
    const data = fs.readFileSync(leadsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

// Helper function to write leads
const writeLeads = (leads) => {
  fs.writeFileSync(leadsFilePath, JSON.stringify(leads, null, 2));
};

// Helper function to read analytics
const readAnalytics = () => {
  try {
    const data = fs.readFileSync(analyticsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {
      totalLeads: 0,
      reachedLeads: 0,
      completedLeads: 0,
      lastUpdated: new Date().toISOString()
    };
  }
};

// Helper function to write analytics
const writeAnalytics = (analytics) => {
  fs.writeFileSync(analyticsFilePath, JSON.stringify(analytics, null, 2));
};

// Helper function to update analytics from leads
const updateAnalytics = () => {
  const leads = readLeads();
  const analytics = {
    totalLeads: leads.length,
    reachedLeads: leads.filter(lead => lead.reached === true).length,
    completedLeads: leads.filter(lead => lead.completed === true).length,
    lastUpdated: new Date().toISOString()
  };
  writeAnalytics(analytics);
  return analytics;
};

// Helper function to read last search results
const readLastSearchResults = () => {
  try {
    const data = fs.readFileSync(lastSearchResultsFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {
      search: "",
      category: "",
      results: null,
      timestamp: ""
    };
  }
};

// Helper function to write last search results
const writeLastSearchResults = (searchData) => {
  fs.writeFileSync(lastSearchResultsFilePath, JSON.stringify(searchData, null, 2));
};

// Helper function to read messages
const readMessages = () => {
  try {
    const data = fs.readFileSync(messagesFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};

// Helper function to write messages
const writeMessages = (messages) => {
  fs.writeFileSync(messagesFilePath, JSON.stringify(messages, null, 2));
};

// Rate limiting configuration
const RATE_LIMIT_MAX_LEADS = 10;
const RATE_LIMIT_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes in milliseconds

// Helper function to read rate limit data
const readRateLimit = () => {
  try {
    const data = fs.readFileSync(rateLimitFilePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    return {
      leadsSent: 0,
      lastBatchTime: null,
      windowStartTime: null
    };
  }
};

// Helper function to write rate limit data
const writeRateLimit = (rateLimitData) => {
  fs.writeFileSync(rateLimitFilePath, JSON.stringify(rateLimitData, null, 2));
};

// Helper function to check and update rate limit
const checkRateLimit = (requestedLeads) => {
  const now = Date.now();
  const rateLimit = readRateLimit();
  
  // Reset if cooldown period has passed
  if (rateLimit.windowStartTime && (now - rateLimit.windowStartTime) >= RATE_LIMIT_COOLDOWN_MS) {
    rateLimit.leadsSent = 0;
    rateLimit.windowStartTime = null;
    rateLimit.lastBatchTime = null;
  }
  
  // Check if we can send the requested number of leads
  const availableLeads = RATE_LIMIT_MAX_LEADS - rateLimit.leadsSent;
  
  if (requestedLeads > availableLeads) {
    const timeUntilReset = rateLimit.windowStartTime 
      ? RATE_LIMIT_COOLDOWN_MS - (now - rateLimit.windowStartTime)
      : 0;
    const minutesRemaining = Math.ceil(timeUntilReset / 60000);
    
    return {
      allowed: false,
      availableLeads,
      requestedLeads,
      leadsSent: rateLimit.leadsSent,
      timeUntilReset,
      minutesRemaining,
      message: `Rate limit exceeded. You can send ${availableLeads} more lead(s) now. Next batch of 10 leads available in ${minutesRemaining} minute(s).`
    };
  }
  
  // Update rate limit
  if (rateLimit.leadsSent === 0) {
    rateLimit.windowStartTime = now;
  }
  rateLimit.leadsSent += requestedLeads;
  rateLimit.lastBatchTime = now;
  writeRateLimit(rateLimit);
  
  return {
    allowed: true,
    availableLeads: RATE_LIMIT_MAX_LEADS - rateLimit.leadsSent,
    leadsSent: rateLimit.leadsSent,
    windowStartTime: rateLimit.windowStartTime
  };
};

// Get greeting based on SL time
const getGreeting = () => {
  const now = new Date();
  const slTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Colombo' }));
  const hour = slTime.getHours();
  
  if (hour >= 5 && hour < 12) {
    return 'Good Morning';
  } else if (hour >= 12 && hour < 17) {
    return 'Good Afternoon';
  } else if (hour >= 17 && hour < 21) {
    return 'Good Evening';
  } else {
    return 'Good Night';
  }
};

// Validate and format Sri Lankan mobile number (+947XXXXXXXX format only)
const isValidMobileNumber = (phone) => {
  if (!phone || typeof phone !== 'string') {
    return null;
  }
  
  // Remove all spaces, dashes, and parentheses
  let cleaned = phone.replace(/[\s\-\(\)]/g, '');
  
  // Remove leading + if present
  if (cleaned.startsWith('+')) {
    cleaned = cleaned.substring(1);
  }
  
  // Check if it's a Sri Lankan mobile number
  // Mobile numbers: +947XXXXXXXX (12 digits total with country code)
  // Formats: +947XXXXXXXX, 947XXXXXXXX, 07XXXXXXXX
  
  // Pattern 1: Already in +947XXXXXXXX format (12 digits)
  if (cleaned.startsWith('947') && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  
  // Pattern 2: Starts with 07 (10 digits) - convert to +947
  if (cleaned.startsWith('07') && cleaned.length === 10) {
    return `+94${cleaned}`;
  }
  
  // Pattern 3: Starts with 947 (11 digits) - add +
  if (cleaned.startsWith('947') && cleaned.length === 11) {
    return `+${cleaned}`;
  }
  
  // Pattern 4: Starts with 7 (9 digits) - add +94
  if (cleaned.startsWith('7') && cleaned.length === 9) {
    return `+94${cleaned}`;
  }
  
  // Not a valid mobile number format - return null to filter out
  return null;
};

// Check if website is valid (not Facebook, LinkedIn, or social media)
const isValidWebsite = (website) => {
  if (!website || !website.trim()) {
    return false;
  }
  
  const url = website.toLowerCase();
  const invalidDomains = [
    'facebook.com',
    'fb.com',
    'linkedin.com',
    'instagram.com',
    'twitter.com',
    'x.com',
    'youtube.com',
    'tiktok.com',
    'pinterest.com',
    'snapchat.com',
    'whatsapp.com',
    'telegram.org'
  ];
  
  return !invalidDomains.some(domain => url.includes(domain));
};

// Root API endpoint
// API health check endpoint (moved to /api to avoid conflict with React app)
app.get('/api', (req, res) => {
  res.json({
    message: 'API is running',
    status: 'success'
  });
});

// Search endpoint - call Google Serper API for pages 1-5
app.post('/api/search', async (req, res) => {
  const { search, category } = req.body;
  console.log('Search query:', { search, category });
  
  if (!search || !search.trim()) {
    return res.status(400).json({ error: 'Search query is required' });
  }

  const apiKey = process.env.SERPER_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    // Fetch pages dynamically - stop when empty page is found
    const allResults = {
      organic: [],
      knowledgeGraph: null,
      peopleAlsoAsk: [],
      relatedSearches: []
    };

    let page = 1;
    let hasMoreResults = true;
    const maxPages = 50; // Safety limit to prevent infinite loops

    while (hasMoreResults && page <= maxPages) {
      const data = JSON.stringify({
        q: search.trim(),
        page: page
      });

      const config = {
        method: 'post',
        maxBodyLength: Infinity,
        url: 'https://google.serper.dev/places',
        headers: {
          'X-API-KEY': apiKey,
          'Content-Type': 'application/json'
        },
        data: data
      };

      const response = await axios.request(config);
      const pageData = response.data;

      // Debug: Log the structure of the response for first page
      if (page === 1) {
        console.log('Page 1 response keys:', Object.keys(pageData));
        console.log('Page 1 full response:', JSON.stringify(pageData, null, 2).substring(0, 500));
      }

      let pageResultsCount = 0;

      // Helper function to clean phone number (remove spaces)
      const cleanPhoneNumber = (phone) => {
        if (!phone) return '';
        return phone.toString().replace(/\s+/g, '');
      };

      // Helper function to validate and format mobile number
      const validateMobileNumber = (phone) => {
        return isValidMobileNumber(phone);
      };

      // The /places endpoint returns results in 'places' array, not 'organic'
      if (pageData.places && Array.isArray(pageData.places) && pageData.places.length > 0) {
        // Convert places to organic format for consistency
        const convertedPlaces = pageData.places.map((place, idx) => {
          // Extract phone number from various possible fields
          let phone = place.phone || place.phoneNumber || place.telephone || '';
          
          // Also check in attributes or other nested fields
          if (!phone && place.attributes) {
            phone = place.attributes.phone || place.attributes.phoneNumber || place.attributes.telephone || '';
          }
          
          // Try to extract from description/snippet if available
          if (!phone && (place.description || place.snippet)) {
            const text = (place.description || place.snippet || '').toString();
            const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
            const phoneMatch = text.match(phoneRegex);
            if (phoneMatch) {
              phone = phoneMatch[0];
            }
          }
          
          // Validate and format mobile number (filter out landlines)
          phone = validateMobileNumber(phone);
          
          // Extract website/link from various possible fields
          let website = place.website || place.url || place.link || '';
          
          // Also check in attributes or other nested fields
          if (!website && place.attributes) {
            website = place.attributes.website || place.attributes.url || place.attributes.link || '';
          }
          
          // Try to extract from description/snippet if available
          if (!website && (place.description || place.snippet)) {
            const text = (place.description || place.snippet || '').toString();
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const urlMatch = text.match(urlRegex);
            if (urlMatch) {
              website = urlMatch[0];
            }
          }
          
          // Only include results with valid mobile numbers
          if (!phone) {
            return null; // Filter out results without valid mobile numbers
          }
          
          return {
            position: allResults.organic.length + idx + 1,
            title: place.title || place.name || '',
            link: website || '',
            snippet: place.description || place.snippet || '',
            address: place.address || '',
            phone: phone,
            rating: place.rating || '',
            reviews: place.reviews || ''
          };
        }).filter(place => place !== null); // Remove null entries (filtered out landlines)
        allResults.organic = allResults.organic.concat(convertedPlaces);
        pageResultsCount = convertedPlaces.length;
        console.log(`Page ${page}: Added ${convertedPlaces.length} places`);
      } else if (pageData.organic && Array.isArray(pageData.organic) && pageData.organic.length > 0) {
        // Standard search endpoint returns organic results
        // Try to extract phone from organic results too
        const enrichedOrganic = pageData.organic.map((result) => {
          let phone = '';
          
          // Extract phone from snippet
          if (result.snippet) {
            const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
            const phoneMatch = result.snippet.match(phoneRegex);
            if (phoneMatch) {
              phone = phoneMatch[0];
            }
          }
          
          // Extract from attributes
          if (!phone && result.attributes) {
            Object.values(result.attributes).forEach(value => {
              if (typeof value === 'string') {
                const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
                const phoneMatch = value.match(phoneRegex);
                if (phoneMatch && !phone) {
                  phone = phoneMatch[0];
                }
              }
            });
          }
          
          // Validate and format mobile number (filter out landlines)
          phone = validateMobileNumber(phone);
          
          // Ensure link/website is present (organic results should already have link)
          let website = result.link || result.url || result.website || '';
          
          // Try to extract from snippet if not available
          if (!website && result.snippet) {
            const urlRegex = /(https?:\/\/[^\s]+)/g;
            const urlMatch = result.snippet.match(urlRegex);
            if (urlMatch) {
              website = urlMatch[0];
            }
          }
          
          // Only include results with valid mobile numbers
          if (!phone) {
            return null; // Filter out results without valid mobile numbers
          }
          
          return {
            ...result,
            link: website || result.link || '',
            phone: phone
          };
        }).filter(result => result !== null); // Remove null entries (filtered out landlines)
        allResults.organic = allResults.organic.concat(enrichedOrganic);
        pageResultsCount = enrichedOrganic.length;
        console.log(`Page ${page}: Added ${enrichedOrganic.length} organic results`);
      } else {
        // No results found on this page - stop fetching
        console.log(`Page ${page}: No results found. Stopping pagination.`);
        hasMoreResults = false;
        break;
      }

      // If page returned 0 results, stop fetching
      if (pageResultsCount === 0) {
        console.log(`Page ${page}: Empty page detected. Stopping pagination.`);
        hasMoreResults = false;
        break;
      }

      // Keep knowledge graph from first page only
      if (page === 1 && pageData.knowledgeGraph) {
        allResults.knowledgeGraph = pageData.knowledgeGraph;
      }

      // Keep peopleAlsoAsk and relatedSearches from first page only
      if (page === 1) {
        if (pageData.peopleAlsoAsk) {
          allResults.peopleAlsoAsk = pageData.peopleAlsoAsk;
        }
        if (pageData.relatedSearches) {
          allResults.relatedSearches = pageData.relatedSearches;
        }
      }

      page++;
    }

    console.log(`Total results: ${allResults.organic.length} organic results from ${page - 1} pages`);
    
    // Filter out leads that have already been saved
    const existingLeads = readLeads();
    const filteredResults = {
      ...allResults,
      organic: allResults.organic.filter(result => {
        // Check if this result matches any existing lead
        const resultPhone = result.phone || '';
        const resultTitle = (result.title || '').trim().toLowerCase();
        const resultLink = (result.link || '').trim().toLowerCase();
        
        // Check against existing leads
        const isDuplicate = existingLeads.some(lead => {
          const leadPhone = (lead.contactNumber || '').trim();
          const leadBusinessName = (lead.businessName || '').trim().toLowerCase();
          const leadWebsite = (lead.website || '').trim().toLowerCase();
          
          // Match by phone number (most reliable)
          if (resultPhone && leadPhone && resultPhone === leadPhone) {
            return true;
          }
          
          // Match by business name + phone number
          if (resultTitle && leadBusinessName && resultPhone && leadPhone) {
            if (resultTitle === leadBusinessName && resultPhone === leadPhone) {
              return true;
            }
          }
          
          // Match by website + phone number
          if (resultLink && leadWebsite && resultPhone && leadPhone) {
            if (resultLink === leadWebsite && resultPhone === leadPhone) {
              return true;
            }
          }
          
          return false;
        });
        
        // Return false to filter out duplicates
        return !isDuplicate;
      })
    };
    
    console.log(`Filtered results: ${filteredResults.organic.length} results (removed ${allResults.organic.length - filteredResults.organic.length} already saved leads)`);
    
    // Save last search results (filtered)
    const lastSearchData = {
      search: search.trim(),
      category: category || '',
      results: filteredResults,
      timestamp: new Date().toISOString()
    };
    writeLastSearchResults(lastSearchData);
    
    res.json({
      message: 'Search completed',
      search,
      category,
      results: filteredResults
    });
  } catch (error) {
    console.error('Error calling Serper API:', error.response?.data || error.message);
    res.status(500).json({
      error: 'Failed to perform search',
      details: error.response?.data || error.message
    });
  }
});

// Save leads endpoint
app.post('/api/leads', (req, res) => {
  const { leads } = req.body;
  
  if (!leads || !Array.isArray(leads)) {
    return res.status(400).json({ error: 'Leads array is required' });
  }

  const existingLeads = readLeads();
  let savedCount = 0;
  const savedLeadIds = [];
  
  // Add new leads (avoid duplicates based on leadId or businessName + contactNumber + searchPhrase)
  leads.forEach(newLead => {
    // Validate required fields
    if (!newLead.leadId || !newLead.businessName || !newLead.searchPhrase) {
      console.warn('Skipping lead with missing required fields:', newLead);
      return;
    }

    // Check for duplicates
    const exists = existingLeads.some(lead => 
      lead.leadId === newLead.leadId || 
      (lead.businessName === newLead.businessName && 
       lead.contactNumber === newLead.contactNumber && 
       lead.searchPhrase === newLead.searchPhrase)
    );
    
    if (!exists) {
      // Ensure all required fields are present
      const leadToSave = {
        leadId: newLead.leadId,
        businessName: newLead.businessName || '',
        contactNumber: newLead.contactNumber || '',
        emailId: newLead.emailId || '',
        website: newLead.website || '',
        searchPhrase: newLead.searchPhrase || '',
        category: newLead.category || '',
        savedDate: newLead.savedDate || new Date().toISOString(),
        reached: false,
        messageSent: false
      };
      existingLeads.push(leadToSave);
      savedLeadIds.push(leadToSave.leadId);
      savedCount++;
    }
  });

  writeLeads(existingLeads);
  
  // Update analytics after saving leads
  const analytics = updateAnalytics();
  
  res.json({
    message: 'Leads saved successfully',
    count: savedCount,
    totalLeads: existingLeads.length,
    savedLeadIds: savedLeadIds,
    analytics
  });
});

// Get all leads
app.get('/api/leads', (req, res) => {
  const leads = readLeads();
  res.json(leads);
});

// Get analytics
app.get('/api/analytics', (req, res) => {
  const analytics = updateAnalytics();
  res.json(analytics);
});

// Get last search results
app.get('/api/last-search', (req, res) => {
  const lastSearch = readLastSearchResults();
  res.json(lastSearch);
});

// Get all messages
app.get('/api/messages', (req, res) => {
  const messages = readMessages();
  res.json(messages);
});

// Save messages
app.post('/api/messages', (req, res) => {
  const { category, messages: messagesArray, type1Message1, type1Message2, type2Message1, type2Message2 } = req.body;
  
  if (!category || !category.trim()) {
    return res.status(400).json({ error: 'Category is required' });
  }

  const allMessages = readMessages();
  
  // Check if messages for this category already exist
  const existingIndex = allMessages.findIndex(msg => msg.category === category.trim());
  
  let messageData;
  
  // Support new format (messages array) or legacy format (type1Message1, type1Message2)
  if (messagesArray && Array.isArray(messagesArray)) {
    // New format: array of messages
    const validMessages = messagesArray.filter(msg => msg && msg.trim() !== '').map(msg => msg.trim());
    
    if (validMessages.length === 0) {
      return res.status(400).json({ error: 'At least one message is required' });
    }
    
    messageData = {
      id: existingIndex !== -1 ? allMessages[existingIndex].id : Date.now().toString(),
      category: category.trim(),
      messages: validMessages,
      sendGreeting: req.body.sendGreeting !== undefined ? req.body.sendGreeting : true, // Default to true for backward compatibility
      createdAt: existingIndex !== -1 ? allMessages[existingIndex].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  } else {
    // Legacy format: support old API structure for backward compatibility
    if (!type1Message1 || !type1Message1.trim() || !type1Message2 || !type1Message2.trim()) {
      return res.status(400).json({ error: 'Both Type 1 messages are required' });
    }

    if (!type2Message1 || !type2Message1.trim() || !type2Message2 || !type2Message2.trim()) {
      return res.status(400).json({ error: 'Both Type 2 messages are required' });
    }
    
    messageData = {
      id: existingIndex !== -1 ? allMessages[existingIndex].id : Date.now().toString(),
      category: category.trim(),
      type1: {
        message1: type1Message1.trim(),
        message2: type1Message2.trim()
      },
      type2: {
        message1: type2Message1.trim(),
        message2: type2Message2.trim()
      },
      createdAt: existingIndex !== -1 ? allMessages[existingIndex].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  if (existingIndex !== -1) {
    // Update existing messages for this category
    allMessages[existingIndex] = messageData;
  } else {
    // Add new messages
    allMessages.push(messageData);
  }

  writeMessages(allMessages);
  
  res.json({
    message: 'Messages saved successfully',
    data: messageData
  });
});

// Update lead status (mark as reached)
app.patch('/api/leads/:leadId/reached', (req, res) => {
  const { leadId } = req.params;
  const leads = readLeads();
  const leadIndex = leads.findIndex(lead => lead.leadId === leadId);
  
  if (leadIndex === -1) {
    return res.status(404).json({ error: 'Lead not found' });
  }
  
  leads[leadIndex].reached = true;
  leads[leadIndex].reachedDate = new Date().toISOString();
  writeLeads(leads);
  
  // Update analytics
  const analytics = updateAnalytics();
  
  res.json({
    message: 'Lead marked as reached',
    lead: leads[leadIndex],
    analytics
  });
});

// Get all characters
app.get('/api/characters', (req, res) => {
  const characters = readCharacters();
  res.json(characters);
});

// Add a new character
app.post('/api/characters', (req, res) => {
  const { name, category } = req.body;
  if (!name || !category) {
    return res.status(400).json({ error: 'Name and category are required' });
  }
  
  const characters = readCharacters();
  const newCharacter = {
    id: Date.now().toString(),
    name,
    category,
    createdAt: new Date().toISOString()
  };
  
  characters.push(newCharacter);
  writeCharacters(characters);
  
  res.json(newCharacter);
});

// Get all categories
app.get('/api/categories', (req, res) => {
  const categories = readCategories();
  res.json(categories);
});

// Add a new category
app.post('/api/categories', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Category name is required' });
  }
  
  const categories = readCategories();
  
  // Check if category already exists
  const exists = categories.some(cat => cat.name.toLowerCase() === name.trim().toLowerCase());
  if (exists) {
    return res.status(400).json({ error: 'Category already exists' });
  }
  
  const newCategory = {
    id: Date.now().toString(),
    name: name.trim(),
    createdAt: new Date().toISOString()
  };
  
  categories.push(newCategory);
  writeCategories(categories);
  
  res.json(newCategory);
});

// WhatsApp Client Setup
let whatsappClient = null;
let whatsappQR = null;
let whatsappStatus = 'disconnected'; // disconnected, connecting, connected
let whatsappAccountInfo = null;

const initWhatsApp = () => {
  if (whatsappClient) {
    return; // Already initialized
  }

  whatsappClient = new Client({
    authStrategy: new LocalAuth({
      dataPath: path.join(__dirname, 'data', 'whatsapp-session')
    }),
    puppeteer: {
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--single-process', // This can help with some sandbox issues
        '--disable-gpu'
      ]
    }
  });

  whatsappClient.on('qr', async (qr) => {
    console.log('\n========================================');
    console.log('QR Code received - Scan with WhatsApp');
    console.log('========================================\n');
    
    // Display QR code in console as ASCII art
    try {
      const qrString = await qrcode.toString(qr, { type: 'terminal', small: true });
      console.log(qrString);
      console.log('\n========================================');
      console.log('Scan the QR code above with WhatsApp');
      console.log('========================================\n');
    } catch (error) {
      console.error('Error generating QR code for console:', error);
    }
    
    // Also generate data URL for web display
    whatsappQR = await qrcode.toDataURL(qr);
    whatsappStatus = 'connecting';
  });

  whatsappClient.on('ready', async () => {
    console.log('WhatsApp client is ready!');
    whatsappStatus = 'connected';
    whatsappQR = null;
    
    // Get account info
    try {
      const info = whatsappClient.info;
      whatsappAccountInfo = {
        wid: info.wid ? info.wid.user : null,
        pushname: info.pushname || null,
        platform: info.platform || null
      };
      console.log('WhatsApp account info:', whatsappAccountInfo);
    } catch (error) {
      console.error('Error getting account info on ready:', error);
    }
  });

  whatsappClient.on('authenticated', () => {
    console.log('WhatsApp authenticated');
  });

  whatsappClient.on('auth_failure', (msg) => {
    console.error('WhatsApp authentication failure:', msg);
    whatsappStatus = 'disconnected';
    whatsappQR = null;
  });

  whatsappClient.on('disconnected', (reason) => {
    console.log('WhatsApp disconnected:', reason);
    whatsappStatus = 'disconnected';
    whatsappQR = null;
    whatsappAccountInfo = null;
    // Reinitialize on disconnect
    setTimeout(() => {
      if (whatsappStatus === 'disconnected') {
        initWhatsApp();
      }
    }, 5000);
  });

  whatsappClient.initialize();
};

// Initialize WhatsApp on server start
initWhatsApp();

// Get WhatsApp connection status
app.get('/api/whatsapp/status', (req, res) => {
  res.json({
    status: whatsappStatus,
    qr: whatsappQR,
    accountInfo: whatsappAccountInfo
  });
});

// Get WhatsApp account info
app.get('/api/whatsapp/account', async (req, res) => {
  if (whatsappStatus !== 'connected' || !whatsappClient) {
    return res.status(400).json({ error: 'WhatsApp is not connected' });
  }

  try {
    const info = whatsappClient.info;
    whatsappAccountInfo = {
      wid: info.wid ? info.wid.user : null,
      pushname: info.pushname || null,
      platform: info.platform || null
    };
    res.json(whatsappAccountInfo);
  } catch (error) {
    console.error('Error getting WhatsApp account info:', error);
    res.status(500).json({ error: 'Failed to get account info' });
  }
});

// Disconnect WhatsApp
app.post('/api/whatsapp/disconnect', async (req, res) => {
  if (whatsappClient) {
    try {
      await whatsappClient.logout();
      whatsappStatus = 'disconnected';
      whatsappQR = null;
      whatsappAccountInfo = null;
      whatsappClient = null;
      res.json({ message: 'WhatsApp disconnected successfully' });
    } catch (error) {
      console.error('Error disconnecting WhatsApp:', error);
      res.status(500).json({ error: 'Failed to disconnect' });
    }
  } else {
    res.json({ message: 'WhatsApp is not connected' });
  }
});

// Get greeting
app.get('/api/greeting', (req, res) => {
  const greeting = getGreeting();
  res.json({ greeting });
});

// Get rate limit status
app.get('/api/rate-limit/status', (req, res) => {
  const now = Date.now();
  const rateLimit = readRateLimit();
  
  // Reset if cooldown period has passed
  if (rateLimit.windowStartTime && (now - rateLimit.windowStartTime) >= RATE_LIMIT_COOLDOWN_MS) {
    rateLimit.leadsSent = 0;
    rateLimit.windowStartTime = null;
    rateLimit.lastBatchTime = null;
    writeRateLimit(rateLimit);
  }
  
  const availableLeads = RATE_LIMIT_MAX_LEADS - rateLimit.leadsSent;
  const timeUntilReset = rateLimit.windowStartTime 
    ? Math.max(0, RATE_LIMIT_COOLDOWN_MS - (now - rateLimit.windowStartTime))
    : 0;
  const minutesRemaining = Math.ceil(timeUntilReset / 60000);
  
  res.json({
    maxLeads: RATE_LIMIT_MAX_LEADS,
    leadsSent: rateLimit.leadsSent,
    availableLeads,
    canSend: availableLeads > 0,
    timeUntilReset,
    minutesRemaining,
    windowStartTime: rateLimit.windowStartTime,
    lastBatchTime: rateLimit.lastBatchTime
  });
});

// Send messages to leads
app.post('/api/whatsapp/send-messages', async (req, res) => {
  if (whatsappStatus !== 'connected' || !whatsappClient) {
    return res.status(400).json({ error: 'WhatsApp is not connected' });
  }

  const { leadIds } = req.body;
  
  if (!leadIds || !Array.isArray(leadIds) || leadIds.length === 0) {
    return res.status(400).json({ error: 'Lead IDs array is required' });
  }

  // Enforce maximum 10 leads per request
  if (leadIds.length > RATE_LIMIT_MAX_LEADS) {
    return res.status(400).json({ 
      error: `Maximum ${RATE_LIMIT_MAX_LEADS} leads can be sent at once. You requested ${leadIds.length} leads.` 
    });
  }

  // Check rate limit
  const rateLimitCheck = checkRateLimit(leadIds.length);
  if (!rateLimitCheck.allowed) {
    return res.status(429).json({
      error: 'Rate limit exceeded',
      message: rateLimitCheck.message,
      availableLeads: rateLimitCheck.availableLeads,
      minutesRemaining: rateLimitCheck.minutesRemaining,
      timeUntilReset: rateLimitCheck.timeUntilReset
    });
  }

  const leads = readLeads();
  const messages = readMessages();
  const greeting = getGreeting();
  const results = [];

  for (let i = 0; i < leadIds.length; i++) {
    const leadId = leadIds[i];
    const lead = leads.find(l => l.leadId === leadId);
    if (!lead) {
      results.push({ leadId, status: 'error', message: 'Lead not found' });
      continue;
    }

    // Check if messages have already been sent to this number
    if (lead.messageSent || lead.reached) {
      results.push({ 
        leadId, 
        status: 'skipped', 
        message: 'Messages already sent to this number',
        phoneNumber: lead.contactNumber
      });
      continue;
    }

    // Get messages for the lead's category
    const categoryMessages = messages.find(msg => msg.category === lead.category);
    if (!categoryMessages) {
      results.push({ leadId, status: 'error', message: 'No messages found for category' });
      continue;
    }

    // Check if website is valid
    const hasValidWebsite = isValidWebsite(lead.website);
    const phoneNumber = lead.contactNumber;

    if (!phoneNumber || phoneNumber === 'N/A') {
      results.push({ leadId, status: 'error', message: 'No contact number' });
      continue;
    }

    try {
      // Format phone number (remove + and spaces, add country code if needed)
      let formattedNumber = phoneNumber.replace(/\s+/g, '').replace(/\+/g, '').replace(/-/g, '');
      
      // Handle Sri Lankan numbers
      if (formattedNumber.startsWith('0') && formattedNumber.length === 10) {
        // Remove leading 0 and add country code
        formattedNumber = '94' + formattedNumber.substring(1);
      } else if (!formattedNumber.startsWith('94') && formattedNumber.length === 9) {
        formattedNumber = '94' + formattedNumber; // Add SL country code
      } else if (formattedNumber.startsWith('+947')) {
        // Already has +947, just remove the +
        formattedNumber = formattedNumber.substring(1);
      }
      
      // Validate the formatted number
      if (!formattedNumber.startsWith('94') || formattedNumber.length < 11 || formattedNumber.length > 12) {
        throw new Error(`Invalid phone number format: ${phoneNumber} (formatted: ${formattedNumber})`);
      }
      
      const chatId = `${formattedNumber}@c.us`;
      
      // Check if the number exists in WhatsApp before sending
      try {
        const numberExists = await whatsappClient.getNumberId(chatId);
        if (!numberExists) {
          throw new Error(`Phone number ${phoneNumber} is not registered on WhatsApp`);
        }
      } catch (checkError) {
        // If getNumberId fails, it might mean the number doesn't exist
        // Log but continue - sometimes this check can fail even for valid numbers
        console.warn(`Could not verify number ${phoneNumber}:`, checkError.message);
      }

      // Send greeting if enabled for this category
      if (categoryMessages.sendGreeting !== false) {
        // Default to true for backward compatibility (if not set, send greeting)
        const greetingMessage = `Hi ${greeting}`;
        await whatsappClient.sendMessage(chatId, greetingMessage);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      }

      // Send messages - support both new format (messages array) and legacy format (type1)
      let messagesToSend = [];
      if (categoryMessages.messages && Array.isArray(categoryMessages.messages)) {
        // New format: use messages array
        messagesToSend = categoryMessages.messages;
      } else if (categoryMessages.type1) {
        // Legacy format: use type1 messages
        messagesToSend = [categoryMessages.type1.message1, categoryMessages.type1.message2].filter(Boolean);
      } else {
        throw new Error('No messages found in category');
      }

      // Send all messages with delay between them
      for (const message of messagesToSend) {
        if (message && message.trim()) {
          // Replace placeholders in message
          let processedMessage = message
            .replace(/{name}/g, lead.name || 'there')
            .replace(/{company}/g, lead.company || '')
            .replace(/{website}/g, lead.website || '')
            .replace(/{email}/g, lead.email || '')
            .replace(/{phone}/g, lead.contactNumber || '')
            .replace(/{category}/g, lead.category || '');
          
          await whatsappClient.sendMessage(chatId, processedMessage);
          await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second between messages
        }
      }

      // Mark lead as reached
      const leadIndex = leads.findIndex(l => l.leadId === leadId);
      if (leadIndex !== -1) {
        leads[leadIndex].reached = true;
        leads[leadIndex].reachedDate = new Date().toISOString();
        leads[leadIndex].messageSent = true;
        leads[leadIndex].messageSentDate = new Date().toISOString();
      }

      results.push({ 
        leadId, 
        status: 'success', 
        message: 'Messages sent successfully'
      });
    } catch (error) {
      console.error(`Error sending message to ${leadId}:`, error);
      
      // Provide more user-friendly error messages
      let errorMessage = error.message;
      if (error.message.includes('No LID for user') || error.message.includes('not registered')) {
        errorMessage = `Phone number ${phoneNumber} is not registered on WhatsApp or is invalid`;
      } else if (error.message.includes('Invalid phone number')) {
        errorMessage = error.message;
      } else if (error.message.includes('not found')) {
        errorMessage = `Contact not found: ${phoneNumber}`;
      }
      
      results.push({ 
        leadId, 
        status: 'error', 
        message: errorMessage,
        phoneNumber: phoneNumber
      });
    }

    // Add random delay between every 2 leads (5-10 seconds)
    // Delay after lead 2, 4, 6, etc. (i is 0-indexed, so i+1 is the lead number)
    if ((i + 1) % 2 === 0 && i < leadIds.length - 1) {
      const delaySeconds = Math.floor(Math.random() * (10 - 5 + 1)) + 5; // Random between 5-10 seconds
      console.log(`Waiting ${delaySeconds} seconds before processing next lead...`);
      await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
    }
  }

  // Save updated leads
  writeLeads(leads);
  updateAnalytics();

  // Get updated rate limit status
  const rateLimit = readRateLimit();
  const availableLeads = RATE_LIMIT_MAX_LEADS - rateLimit.leadsSent;
  const timeUntilReset = rateLimit.windowStartTime 
    ? Math.max(0, RATE_LIMIT_COOLDOWN_MS - (Date.now() - rateLimit.windowStartTime))
    : 0;
  const minutesRemaining = Math.ceil(timeUntilReset / 60000);

  res.json({
    message: 'Message sending completed',
    results,
    summary: {
      total: results.length,
      success: results.filter(r => r.status === 'success').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      failed: results.filter(r => r.status === 'error').length
    },
    rateLimit: {
      leadsSent: rateLimit.leadsSent,
      availableLeads,
      canSendMore: availableLeads > 0,
      minutesRemaining,
      timeUntilReset
    }
  });
});

// Helper function to extract email from text
const extractEmailFromText = (text) => {
  if (!text) return '';
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emailMatch = text.match(emailRegex);
  return emailMatch ? emailMatch[0] : '';
};

// Save search results to Google Sheets
app.post('/api/google-sheets/save', async (req, res) => {
  try {
    const { searchResults, searchPhrase, category } = req.body;

    if (!searchResults || !searchResults.organic || !Array.isArray(searchResults.organic)) {
      return res.status(400).json({ error: 'Invalid search results data' });
    }

    if (!searchPhrase) {
      return res.status(400).json({ error: 'Search phrase is required' });
    }

    // Check if Google Sheets credentials are configured
    if (!process.env.GOOGLE_SHEETS_SPREADSHEET_ID) {
      return res.status(400).json({ 
        error: 'Google Sheets not configured. Please set GOOGLE_SHEETS_SPREADSHEET_ID in .env file' 
      });
    }

    // Initialize Google Sheets API
    let auth;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY) {
      // Use service account authentication
      auth = new google.auth.JWT(
        process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        null,
        process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        ['https://www.googleapis.com/auth/spreadsheets']
      );
    } else {
      return res.status(400).json({ 
        error: 'Google Sheets authentication not configured. Please set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY in .env file' 
      });
    }

    const sheets = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;

    // Log for debugging (remove sensitive info in production)
    console.log(`Attempting to access spreadsheet: ${spreadsheetId}`);
    console.log(`Using service account: ${serviceAccountEmail}`);

    // Sanitize sheet name (Google Sheets has restrictions on sheet names)
    let sheetName = searchPhrase.trim();
    // Remove invalid characters and limit length
    sheetName = sheetName.replace(/[\\\/\?\*\[\]:]/g, '').substring(0, 100);
    if (!sheetName) {
      sheetName = 'Search Results';
    }

    // Prepare data
    const headers = [['Title', 'Contact Number', 'Website', 'Snippet', 'Email', 'Search Phrase', 'Category']];
    const rows = searchResults.organic.map((result) => {
      let emailId = extractEmailFromText(result.snippet || '');
      if (!emailId) {
        emailId = extractEmailFromText(result.link || '');
      }
      if (!emailId) {
        emailId = extractEmailFromText(result.title || '');
      }

      return [
        result.title || '',
        result.phone || 'N/A',
        result.link || '',
        result.snippet || '',
        emailId || '',
        searchPhrase || '',
        category || ''
      ];
    });

    const values = [...headers, ...rows];

    // Check if sheet exists, if not create it
    try {
      // First, verify we can access the spreadsheet
      const spreadsheet = await sheets.spreadsheets.get({ spreadsheetId });
      console.log(`Successfully accessed spreadsheet: ${spreadsheet.data.properties.title}`);
      
      const existingSheets = spreadsheet.data.sheets.map(sheet => sheet.properties.title);
      
      if (!existingSheets.includes(sheetName)) {
        // Create new sheet
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [{
              addSheet: {
                properties: {
                  title: sheetName
                }
              }
            }]
          }
        });
      } else {
        // Clear existing sheet data (optional - comment out if you want to append)
        await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range: `${sheetName}!A1:Z10000`
        });
      }
    } catch (error) {
      // If spreadsheet doesn't exist or access denied
      if (error.code === 404) {
        return res.status(404).json({ 
          error: 'Google Spreadsheet not found. Please check the GOOGLE_SHEETS_SPREADSHEET_ID.',
          details: 'Make sure the Spreadsheet ID in your .env file matches the ID in your Google Sheets URL.'
        });
      }
      if (error.code === 403) {
        const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'your-service-account@...';
        return res.status(403).json({ 
          error: 'Access denied. Please ensure the service account has access to the spreadsheet.',
          details: `Share your Google Spreadsheet with this email address: ${serviceAccountEmail}`,
          instructions: [
            '1. Open your Google Spreadsheet',
            '2. Click the "Share" button (top right)',
            `3. Add this email: ${serviceAccountEmail}`,
            '4. Give it "Editor" access',
            '5. Click "Send" or "Share"',
            '6. Try saving again'
          ]
        });
      }
      throw error;
    }

    // Write data to sheet
    try {
      await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${sheetName}!A1`,
        valueInputOption: 'USER_ENTERED',
        resource: {
          values: values
        }
      });
    } catch (writeError) {
      console.error('Error writing to Google Sheets:', writeError);
      if (writeError.code === 403) {
        const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'your-service-account@...';
        return res.status(403).json({ 
          error: 'Access denied when writing to sheet.',
          details: `The service account ${serviceAccountEmail} needs Editor access to write data.`,
          instructions: [
            '1. Make sure you shared the spreadsheet with the service account email',
            `2. Service account email: ${serviceAccountEmail}`,
            '3. Permission must be "Editor" (not Viewer or Commenter)',
            '4. Wait a few seconds after sharing for permissions to propagate',
            '5. Try again'
          ]
        });
      }
      throw writeError;
    }

    // Get the spreadsheet URL
    const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}`;

    res.json({
      message: 'Search results saved to Google Sheets successfully',
      sheetName: sheetName,
      rowCount: rows.length,
      spreadsheetUrl: spreadsheetUrl
    });

  } catch (error) {
    console.error('Error saving to Google Sheets:', error);
    const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || 'not configured';
    
    // Provide more specific error messages
    let errorMessage = 'Error saving to Google Sheets';
    let errorDetails = error.message || 'Unknown error';
    
    if (error.message && error.message.includes('invalid_grant')) {
      errorMessage = 'Authentication failed';
      errorDetails = 'The private key or service account email is incorrect. Please check your .env file.';
    } else if (error.message && error.message.includes('API has not been used')) {
      errorMessage = 'Google Sheets API not enabled';
      errorDetails = 'Please enable the Google Sheets API in your Google Cloud Console project.';
    } else if (error.code === 403) {
      errorMessage = 'Access denied';
      errorDetails = `Service account ${serviceAccountEmail} needs Editor access to the spreadsheet.`;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: errorDetails,
      serviceAccountEmail: serviceAccountEmail,
      errorCode: error.code
    });
  }
});

// Serve React app - catch all handler (must be after all API routes)
if (fs.existsSync(buildPath)) {
  // Serve static files from React build folder
  app.use(express.static(buildPath));
  console.log('Serving React app from:', buildPath);
  
  // Catch all handler: send back React's index.html file for client-side routing
  app.get('*', (req, res) => {
    // Don't serve index.html for API routes
    if (req.path.startsWith('/api/')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  console.warn('React build folder not found. Run "npm run build" in the frontend directory.');
  // Fallback for development
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/')) {
      res.status(404).send('React build folder not found. Please run "npm run build" in the frontend directory.');
    }
  });
}

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  if (fs.existsSync(buildPath)) {
    console.log('React app is being served from the build folder');
  }
});

