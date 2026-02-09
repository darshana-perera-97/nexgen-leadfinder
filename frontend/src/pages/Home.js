import { useState, useEffect } from 'react';
import API_ENDPOINTS from '../config/api';

function Home() {
  const [searchText, setSearchText] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState([]);
  const [searchResults, setSearchResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [extractedLeads, setExtractedLeads] = useState([]);
  const [savingLeads, setSavingLeads] = useState(false);
  const [sendingMessages, setSendingMessages] = useState(false);
  const [sendingProgress, setSendingProgress] = useState(null);
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [totalLeads, setTotalLeads] = useState(0);
  const [reachedLeads, setReachedLeads] = useState(0);
  const [greeting, setGreeting] = useState('');
  const [rateLimit, setRateLimit] = useState({
    maxLeads: 10,
    leadsSent: 0,
    availableLeads: 10,
    canSend: true,
    minutesRemaining: 0
  });

  useEffect(() => {
    fetchCategories();
    fetchTotalLeads();
    fetchAnalytics();
    fetchLastSearchResults();
    fetchGreeting();
    fetchRateLimitStatus();
    // Update greeting every minute
    const interval = setInterval(fetchGreeting, 60000);
    // Poll rate limit status every 30 seconds
    const rateLimitInterval = setInterval(fetchRateLimitStatus, 30000);
    return () => {
      clearInterval(interval);
      clearInterval(rateLimitInterval);
    };
  }, []);

  const fetchRateLimitStatus = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.RATE_LIMIT_STATUS);
      if (response.ok) {
        const data = await response.json();
        setRateLimit(data);
      }
    } catch (error) {
      console.error('Error fetching rate limit status:', error);
    }
  };

  const fetchCategories = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.CATEGORIES);
      if (response.ok) {
        const data = await response.json();
        setCategories(data);
      }
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const fetchTotalLeads = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.LEADS);
      if (response.ok) {
        const data = await response.json();
        setTotalLeads(data.length);
      }
    } catch (error) {
      console.error('Error fetching total leads:', error);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.ANALYTICS);
      if (response.ok) {
        const data = await response.json();
        setReachedLeads(data.reachedLeads || 0);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const fetchGreeting = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.GREETING);
      if (response.ok) {
        const data = await response.json();
        setGreeting(data.greeting);
      }
    } catch (error) {
      console.error('Error fetching greeting:', error);
    }
  };

  const fetchLastSearchResults = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.LAST_SEARCH);
      if (response.ok) {
        const data = await response.json();
        if (data.results && data.results.organic && data.results.organic.length > 0) {
          setSearchResults(data.results);
          setSearchText(data.search || '');
          setCategory(data.category || '');
          // Extract leads from last search results
          extractLeads(data.results, data.search || '');
        }
      }
    } catch (error) {
      console.error('Error fetching last search results:', error);
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

  const handleSearch = async () => {
    if (!searchText.trim()) {
      alert('Please enter a search term');
      return;
    }
    
    if (!category || category.trim() === '') {
      alert('Please select a category before searching');
      return;
    }
    
    setLoading(true);
    setSearchResults(null);
    
    try {
      const response = await fetch(API_ENDPOINTS.SEARCH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ search: searchText, category }),
      });
      
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data.results);
        // Extract leads from results
        extractLeads(data.results, searchText);
        // Reset selections when new search is performed
        setSelectedItems(new Set());
        setSelectAll(false);
      } else {
        const error = await response.json();
        alert(error.error || 'Error performing search');
      }
    } catch (error) {
      console.error('Error searching:', error);
      alert('Error performing search');
    } finally {
      setLoading(false);
    }
  };

  // Extract leads from search results
  const extractLeads = (results, searchPhrase) => {
    const leads = [];
    
    if (results.organic && Array.isArray(results.organic)) {
      results.organic.forEach((result) => {
        // Extract business name from title
        const businessName = result.title || '';
        
        // Extract website from link
        const website = result.link || '';
        
        // Get phone number from result (already validated by backend)
        let contactNumber = result.phone || '';
        
        // If phone not in result, try to extract from snippet
        if (!contactNumber && result.snippet) {
          const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
          const phoneMatch = result.snippet.match(phoneRegex);
          if (phoneMatch) {
            contactNumber = phoneMatch[0];
          }
        }
        
        // Validate mobile number (filter out landlines)
        contactNumber = isValidMobileNumber(contactNumber);

        // Only add if we have business name, website, and valid mobile number
        if (businessName && website && contactNumber) {
          leads.push({
            businessName: businessName.trim(),
            contactNumber: contactNumber,
            website: website.trim(),
            searchPhrase: searchPhrase.trim()
          });
        }
      });
    }

    // Also check knowledge graph
    if (results.knowledgeGraph) {
      const kg = results.knowledgeGraph;
      let contactNumber = '';
      
      if (kg.attributes) {
        Object.entries(kg.attributes).forEach(([key, value]) => {
          if (typeof value === 'string' && /phone|contact|tel|sales/i.test(key)) {
            contactNumber = value;
          } else if (typeof value === 'string') {
            const phoneRegex = /(\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g;
            const phoneMatch = value.match(phoneRegex);
            if (phoneMatch) {
              contactNumber = phoneMatch[0];
            }
          }
        });
      }

      if (kg.title && kg.website) {
        // Remove spaces from contact number
        const cleanedContactNumber = contactNumber.trim().replace(/\s+/g, '') || 'N/A';
        leads.push({
          businessName: kg.title.trim(),
          contactNumber: cleanedContactNumber,
          website: kg.website.trim(),
          searchPhrase: searchPhrase.trim()
        });
      }
    }

    setExtractedLeads(leads);
  };

  // Handle individual checkbox selection
  const handleItemSelect = (index) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      // Limit to 10 leads max
      if (newSelected.size >= 10) {
        alert('Maximum 10 leads can be selected at once. Please deselect some leads first.');
        return;
      }
      newSelected.add(index);
    }
    setSelectedItems(newSelected);
    // Update selectAll state based on whether all items are selected
    if (searchResults && searchResults.organic) {
      setSelectAll(newSelected.size === searchResults.organic.length && searchResults.organic.length > 0);
    }
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedItems(new Set());
      setSelectAll(false);
    } else {
      // Limit to 10 leads max
      const maxSelectable = Math.min(10, searchResults.organic.length);
      const selectedIndices = new Set(Array.from({ length: maxSelectable }, (_, i) => i));
      setSelectedItems(selectedIndices);
      setSelectAll(maxSelectable === searchResults.organic.length);
      if (searchResults.organic.length > 10) {
        alert('Maximum 10 leads can be selected at once. Only the first 10 leads were selected.');
      }
    }
  };

  // Extract email from text
  const extractEmail = (text) => {
    if (!text) return '';
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emailMatch = text.match(emailRegex);
    return emailMatch ? emailMatch[0] : '';
  };

  // Download search results as CSV
  const handleDownloadCSV = () => {
    if (!searchResults || !searchResults.organic || searchResults.organic.length === 0) {
      alert('No search results to download');
      return;
    }

    // CSV headers
    const headers = ['Title', 'Contact Number', 'Website', 'Snippet', 'Email', 'Search Phrase', 'Category'];
    
    // Convert search results to CSV rows
    const csvRows = searchResults.organic.map((result) => {
      // Extract email from snippet, link, or title
      let emailId = extractEmail(result.snippet || '');
      if (!emailId) {
        emailId = extractEmail(result.link || '');
      }
      if (!emailId) {
        emailId = extractEmail(result.title || '');
      }

      // Escape CSV values (handle commas, quotes, and newlines)
      const escapeCSV = (value) => {
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        // If value contains comma, quote, or newline, wrap in quotes and escape quotes
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      };

      return [
        escapeCSV(result.title || ''),
        escapeCSV(result.phone || 'N/A'),
        escapeCSV(result.link || ''),
        escapeCSV(result.snippet || ''),
        escapeCSV(emailId || ''),
        escapeCSV(searchText || ''),
        escapeCSV(category || '')
      ].join(',');
    });

    // Combine headers and rows
    const csvContent = [
      headers.join(','),
      ...csvRows
    ].join('\n');

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `search-results-${searchText.replace(/[^a-z0-9]/gi, '-').toLowerCase()}-${timestamp}.csv`;
    
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  // Send messages to selected leads from search results
  const handleSendMessagesToSelected = async () => {
    if (selectedItems.size === 0) {
      alert('Please select at least one item to send messages');
      return;
    }

    if (!searchResults || !searchResults.organic) {
      alert('No search results available');
      return;
    }

    // Check rate limit before proceeding
    await fetchRateLimitStatus();
    const currentRateLimit = await fetch(API_ENDPOINTS.RATE_LIMIT_STATUS).then(r => r.json()).catch(() => rateLimit);
    if (!currentRateLimit.canSend) {
      alert(`Rate limit reached. You can send ${currentRateLimit.availableLeads} more lead(s). Next batch available in ${currentRateLimit.minutesRemaining} minute(s).`);
      return;
    }
    
    if (selectedItems.size > currentRateLimit.availableLeads) {
      alert(`You can only send ${currentRateLimit.availableLeads} more lead(s) right now. Please select fewer leads or wait ${currentRateLimit.minutesRemaining} minute(s) for the next batch.`);
      return;
    }

    // Check WhatsApp connection first
    try {
      const statusResponse = await fetch(API_ENDPOINTS.WHATSAPP_STATUS);
      if (statusResponse.ok) {
        const statusData = await statusResponse.json();
        if (statusData.status !== 'connected') {
          alert('WhatsApp is not connected. Please connect WhatsApp first from the Link page.');
          return;
        }
      }
    } catch (error) {
      console.error('Error checking WhatsApp status:', error);
      alert('Error checking WhatsApp status. Please ensure WhatsApp is connected.');
      return;
    }

    setSendingMessages(true);
    try {
      // First, save the selected leads
      const selectedLeads = Array.from(selectedItems).map((index) => {
        const result = searchResults.organic[index];
        // Extract email from snippet, link, or title
        let emailId = extractEmail(result.snippet || '');
        if (!emailId) {
          emailId = extractEmail(result.link || '');
        }
        if (!emailId) {
          emailId = extractEmail(result.title || '');
        }

        // Validate mobile number before saving
        let contactNumber = result.phone || '';
        if (contactNumber) {
          contactNumber = isValidMobileNumber(contactNumber);
        }
        
        // Only save if we have a valid mobile number
        if (!contactNumber) {
          return null;
        }
        
        return {
          leadId: `lead_${Date.now()}_${index}`,
          businessName: result.title || '',
          contactNumber: contactNumber,
          emailId: emailId || '',
          website: result.link || '',
          searchPhrase: searchText.trim(),
          category: category || '',
          savedDate: new Date().toISOString()
        };
      }).filter(lead => lead !== null); // Remove null entries

      if (selectedLeads.length === 0) {
        alert('No valid leads with mobile numbers found in selected items');
        setSendingMessages(false);
        return;
      }

      // Save leads first
      const saveResponse = await fetch(API_ENDPOINTS.LEADS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leads: selectedLeads }),
      });

      if (!saveResponse.ok) {
        const error = await saveResponse.json();
        alert(error.error || 'Error saving leads');
        setSendingMessages(false);
        return;
      }

      const saveData = await saveResponse.json();
      const savedLeadIds = saveData.savedLeadIds || [];

      if (savedLeadIds.length === 0) {
        alert('No leads were saved. They may already exist.');
        setSendingMessages(false);
        return;
      }

      // Batch leads into groups of 10 and send with 10-minute delays
      const batchLeads = (leads, batchSize = 10) => {
        const batches = [];
        for (let i = 0; i < leads.length; i += batchSize) {
          batches.push(leads.slice(i, i + batchSize));
        }
        return batches;
      };

      const batches = batchLeads(savedLeadIds, 10);
      const totalGroups = batches.length;
      let sentLeads = 0;
      let failedLeads = 0;
      let skippedLeads = 0;

      // Initialize progress tracking
      setSendingProgress({
        totalGroups,
        currentGroup: 0,
        totalLeads: savedLeadIds.length,
        sentLeads: 0,
        failedLeads: 0,
        skippedLeads: 0
      });

      for (let groupIndex = 0; groupIndex < batches.length; groupIndex++) {
        const batch = batches[groupIndex];
        
        // Update progress
        setSendingProgress(prev => ({
          ...prev,
          currentGroup: groupIndex + 1,
          nextGroupTime: groupIndex > 0 ? Date.now() + 10 * 60 * 1000 : null
        }));

        // Wait 10 minutes before sending (except for first group)
        if (groupIndex > 0) {
          const waitTime = 10 * 60 * 1000; // 10 minutes in milliseconds
          const startTime = Date.now();
          
          // Update countdown every second
          const countdownInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, waitTime - elapsed);
            const minutes = Math.floor(remaining / 60000);
            const seconds = Math.floor((remaining % 60000) / 1000);
            
            setSendingProgress(prev => ({
              ...prev,
              nextGroupTime: remaining,
              countdownText: `Waiting ${minutes}:${seconds.toString().padStart(2, '0')} before next group...`
            }));
          }, 1000);

          await new Promise(resolve => setTimeout(resolve, waitTime));
          clearInterval(countdownInterval);
          
          setSendingProgress(prev => ({
            ...prev,
            nextGroupTime: null,
            countdownText: null
          }));
        }

        // Send the batch
        try {
          const sendResponse = await fetch(API_ENDPOINTS.WHATSAPP_SEND_MESSAGES, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ leadIds: batch }),
          });

          if (sendResponse.ok) {
            const sendData = await sendResponse.json();
            sentLeads += sendData.summary.success || 0;
            failedLeads += sendData.summary.failed || 0;
            skippedLeads += sendData.summary.skipped || 0;
            
            setSendingProgress(prev => ({
              ...prev,
              sentLeads: prev.sentLeads + (sendData.summary.success || 0),
              failedLeads: prev.failedLeads + (sendData.summary.failed || 0),
              skippedLeads: prev.skippedLeads + (sendData.summary.skipped || 0)
            }));

            fetchRateLimitStatus();
          } else {
            const sendError = await sendResponse.json();
            failedLeads += batch.length;
            setSendingProgress(prev => ({
              ...prev,
              failedLeads: prev.failedLeads + batch.length
            }));
            
            if (sendError.error === 'Rate limit exceeded') {
              fetchRateLimitStatus();
            }
          }
        } catch (error) {
          console.error(`Error sending batch ${groupIndex + 1}:`, error);
          failedLeads += batch.length;
          setSendingProgress(prev => ({
            ...prev,
            failedLeads: prev.failedLeads + batch.length
          }));
        }
      }

      // All batches completed - show completion popup
      const completionMessage = `✅ Task Completed!\n\n` +
        `Total Leads: ${savedLeadIds.length}\n` +
        `Successfully Sent: ${sentLeads}\n` +
        `Skipped: ${skippedLeads}\n` +
        `Failed: ${failedLeads}\n` +
        `Groups Processed: ${totalGroups}`;
      
      alert(completionMessage);
      setSendingProgress(null);

      // Update total leads count
      setTotalLeads(saveData.totalLeads);
      // Update analytics if provided
      if (saveData.analytics) {
        setReachedLeads(saveData.analytics.reachedLeads || 0);
      }
      // Clear selections after sending
      setSelectedItems(new Set());
      setSelectAll(false);
    } catch (error) {
      console.error('Error sending messages:', error);
      alert('Error sending messages. Please try again.');
    } finally {
      setSendingMessages(false);
    }
  };

  // Save selected leads to backend
  const handleSaveSelectedLeads = async () => {
    if (selectedItems.size === 0) {
      alert('Please select at least one item to save');
      return;
    }

    if (!searchResults || !searchResults.organic) {
      alert('No search results available');
      return;
    }

    setSavingLeads(true);
    try {
      const selectedLeads = Array.from(selectedItems).map((index) => {
        const result = searchResults.organic[index];
        // Extract email from snippet, link, or title
        let emailId = extractEmail(result.snippet || '');
        if (!emailId) {
          emailId = extractEmail(result.link || '');
        }
        if (!emailId) {
          emailId = extractEmail(result.title || '');
        }

        // Validate mobile number before saving
        let contactNumber = result.phone || '';
        if (contactNumber) {
          contactNumber = isValidMobileNumber(contactNumber);
        }
        
        // Only save if we have a valid mobile number
        if (!contactNumber) {
          return null;
        }
        
        return {
          leadId: `lead_${Date.now()}_${index}`,
          businessName: result.title || '',
          contactNumber: contactNumber,
          emailId: emailId || '',
          website: result.link || '',
          searchPhrase: searchText.trim(),
          category: category || '',
          savedDate: new Date().toISOString()
        };
      }).filter(lead => lead !== null); // Remove null entries

      const response = await fetch(API_ENDPOINTS.LEADS, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ leads: selectedLeads }),
      });

      if (response.ok) {
        const data = await response.json();
        
        // Get the leadIds of the saved leads
        const savedLeadIds = data.savedLeadIds || [];
        
        if (savedLeadIds.length > 0) {
          // Batch leads into groups of 10 and send with 10-minute delays
          const batchLeads = (leads, batchSize = 10) => {
            const batches = [];
            for (let i = 0; i < leads.length; i += batchSize) {
              batches.push(leads.slice(i, i + batchSize));
            }
            return batches;
          };

          const batches = batchLeads(savedLeadIds, 10);
          const totalGroups = batches.length;
          let sentLeads = 0;
          let failedLeads = 0;
          let skippedLeads = 0;

          // Initialize progress tracking
          setSendingProgress({
            totalGroups,
            currentGroup: 0,
            totalLeads: savedLeadIds.length,
            sentLeads: 0,
            failedLeads: 0,
            skippedLeads: 0
          });

          try {
            for (let groupIndex = 0; groupIndex < batches.length; groupIndex++) {
              const batch = batches[groupIndex];
              
              // Update progress
              setSendingProgress(prev => ({
                ...prev,
                currentGroup: groupIndex + 1,
                nextGroupTime: groupIndex > 0 ? Date.now() + 10 * 60 * 1000 : null
              }));

              // Wait 10 minutes before sending (except for first group)
              if (groupIndex > 0) {
                const waitTime = 10 * 60 * 1000; // 10 minutes in milliseconds
                const startTime = Date.now();
                
                // Update countdown every second
                const countdownInterval = setInterval(() => {
                  const elapsed = Date.now() - startTime;
                  const remaining = Math.max(0, waitTime - elapsed);
                  const minutes = Math.floor(remaining / 60000);
                  const seconds = Math.floor((remaining % 60000) / 1000);
                  
                  setSendingProgress(prev => ({
                    ...prev,
                    nextGroupTime: remaining,
                    countdownText: `Waiting ${minutes}:${seconds.toString().padStart(2, '0')} before next group...`
                  }));
                }, 1000);

                await new Promise(resolve => setTimeout(resolve, waitTime));
                clearInterval(countdownInterval);
                
                setSendingProgress(prev => ({
                  ...prev,
                  nextGroupTime: null,
                  countdownText: null
                }));
              }

              // Send the batch
              try {
                const sendResponse = await fetch(API_ENDPOINTS.WHATSAPP_SEND_MESSAGES, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({ leadIds: batch }),
                });

                if (sendResponse.ok) {
                  const sendData = await sendResponse.json();
                  sentLeads += sendData.summary.success || 0;
                  failedLeads += sendData.summary.failed || 0;
                  skippedLeads += sendData.summary.skipped || 0;
                  
                  setSendingProgress(prev => ({
                    ...prev,
                    sentLeads: prev.sentLeads + (sendData.summary.success || 0),
                    failedLeads: prev.failedLeads + (sendData.summary.failed || 0),
                    skippedLeads: prev.skippedLeads + (sendData.summary.skipped || 0)
                  }));

                  fetchRateLimitStatus();
                } else {
                  const sendError = await sendResponse.json();
                  failedLeads += batch.length;
                  setSendingProgress(prev => ({
                    ...prev,
                    failedLeads: prev.failedLeads + batch.length
                  }));
                  
                  if (sendError.error === 'Rate limit exceeded') {
                    fetchRateLimitStatus();
                  }
                }
              } catch (error) {
                console.error(`Error sending batch ${groupIndex + 1}:`, error);
                failedLeads += batch.length;
                setSendingProgress(prev => ({
                  ...prev,
                  failedLeads: prev.failedLeads + batch.length
                }));
              }
            }

            // All batches completed - show completion popup
            const completionMessage = `✅ Task Completed!\n\n` +
              `Total Leads: ${savedLeadIds.length}\n` +
              `Successfully Sent: ${sentLeads}\n` +
              `Skipped: ${skippedLeads}\n` +
              `Failed: ${failedLeads}\n` +
              `Groups Processed: ${totalGroups}`;
            
            alert(completionMessage);
            setSendingProgress(null);
          } catch (sendError) {
            console.error('Error in batch sending:', sendError);
            alert(`Successfully saved ${data.count} leads! Total leads: ${data.totalLeads}\n\nError sending messages. Please try sending manually from Leads page.`);
            setSendingProgress(null);
          }
        } else {
          alert(`Successfully saved ${data.count} leads! Total leads: ${data.totalLeads}`);
        }
        
        // Update total leads count
        setTotalLeads(data.totalLeads);
        // Update analytics if provided
        if (data.analytics) {
          setReachedLeads(data.analytics.reachedLeads || 0);
        }
        // Clear selections after saving
        setSelectedItems(new Set());
        setSelectAll(false);
      } else {
        const error = await response.json();
        alert(error.error || 'Error saving leads');
      }
    } catch (error) {
      console.error('Error saving leads:', error);
      alert('Error saving leads');
    } finally {
      setSavingLeads(false);
    }
  };

  return (
    <div className="container mt-4">
      {greeting && (
        <div className="alert alert-info mb-4" style={{ borderRadius: '12px', border: 'none', background: '#eff6ff', color: '#1e40af', padding: '16px 20px' }}>
          <strong>Greeting:</strong> Hi {greeting}
        </div>
      )}

      {/* Sending Progress Analytics */}
      {sendingProgress && (
        <div className="card mb-4" style={{ borderLeft: '4px solid #10b981', background: '#f0fdf4' }}>
          <div className="card-body">
            <div className="d-flex align-items-center justify-content-between mb-3">
              <h5 className="mb-0" style={{ fontWeight: '600', color: '#065f46' }}>
                📊 Sending Progress
              </h5>
              <span className="badge" style={{ background: '#10b981', color: 'white', fontSize: '12px', padding: '6px 12px' }}>
                Group {sendingProgress.currentGroup} of {sendingProgress.totalGroups}
              </span>
            </div>
            
            <div className="row g-3 mb-3">
              <div className="col-md-3">
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                  <small className="text-muted d-block" style={{ fontSize: '11px', marginBottom: '4px' }}>Total Leads</small>
                  <strong style={{ fontSize: '18px', color: '#1e293b' }}>{sendingProgress.totalLeads}</strong>
                </div>
              </div>
              <div className="col-md-3">
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                  <small className="text-muted d-block" style={{ fontSize: '11px', marginBottom: '4px' }}>Sent</small>
                  <strong style={{ fontSize: '18px', color: '#10b981' }}>{sendingProgress.sentLeads}</strong>
                </div>
              </div>
              <div className="col-md-3">
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                  <small className="text-muted d-block" style={{ fontSize: '11px', marginBottom: '4px' }}>Failed</small>
                  <strong style={{ fontSize: '18px', color: '#ef4444' }}>{sendingProgress.failedLeads}</strong>
                </div>
              </div>
              <div className="col-md-3">
                <div style={{ background: 'white', padding: '12px', borderRadius: '8px', border: '1px solid #d1fae5' }}>
                  <small className="text-muted d-block" style={{ fontSize: '11px', marginBottom: '4px' }}>Remaining</small>
                  <strong style={{ fontSize: '18px', color: '#6366f1' }}>
                    {sendingProgress.totalLeads - sendingProgress.sentLeads - sendingProgress.failedLeads - (sendingProgress.skippedLeads || 0)}
                  </strong>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-2">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <small className="text-muted" style={{ fontSize: '12px' }}>Overall Progress</small>
                <small className="text-muted" style={{ fontSize: '12px' }}>
                  {Math.round(((sendingProgress.sentLeads + sendingProgress.failedLeads + (sendingProgress.skippedLeads || 0)) / sendingProgress.totalLeads) * 100)}%
                </small>
              </div>
              <div className="progress" style={{ height: '8px', borderRadius: '4px' }}>
                <div 
                  className="progress-bar bg-success" 
                  role="progressbar" 
                  style={{ 
                    width: `${((sendingProgress.sentLeads + sendingProgress.failedLeads + (sendingProgress.skippedLeads || 0)) / sendingProgress.totalLeads) * 100}%`,
                    transition: 'width 0.3s ease'
                  }}
                ></div>
              </div>
            </div>

            {/* Group Progress */}
            <div className="mb-2">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <small className="text-muted" style={{ fontSize: '12px' }}>Group Progress</small>
                <small className="text-muted" style={{ fontSize: '12px' }}>
                  {sendingProgress.currentGroup} / {sendingProgress.totalGroups} groups
                </small>
              </div>
              <div className="progress" style={{ height: '8px', borderRadius: '4px' }}>
                <div 
                  className="progress-bar bg-primary" 
                  role="progressbar" 
                  style={{ 
                    width: `${(sendingProgress.currentGroup / sendingProgress.totalGroups) * 100}%`,
                    transition: 'width 0.3s ease'
                  }}
                ></div>
              </div>
            </div>

            {/* Countdown Timer */}
            {sendingProgress.countdownText && (
              <div className="mt-2 p-2" style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: '6px' }}>
                <small style={{ color: '#92400e', fontSize: '13px' }}>
                  ⏱️ {sendingProgress.countdownText}
                </small>
              </div>
            )}

            {/* Status Text */}
            <div className="mt-2">
              <small className="text-muted" style={{ fontSize: '12px' }}>
                {sendingProgress.currentGroup < sendingProgress.totalGroups 
                  ? `Processing group ${sendingProgress.currentGroup} of ${sendingProgress.totalGroups}...`
                  : 'Finalizing...'}
              </small>
            </div>
          </div>
        </div>
      )}

      <h2 className="mb-4">Analytics</h2>
      
      {/* Analytics Cards */}
      <div className="row g-4 mb-5">
        <div className="col-md-6 col-lg-3">
          <div className="card" style={{ borderLeft: '4px solid #6366f1' }}>
            <div className="card-body">
              <h6 className="card-title text-muted mb-2" style={{ fontSize: '13px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Leads</h6>
              <h2 className="mb-0" style={{ color: '#6366f1', fontWeight: '700', fontSize: '32px' }}>{totalLeads}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-6 col-lg-3">
          <div className="card" style={{ borderLeft: '4px solid #10b981' }}>
            <div className="card-body">
              <h6 className="card-title text-muted mb-2" style={{ fontSize: '13px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current Search Results</h6>
              <h2 className="mb-0" style={{ color: '#10b981', fontWeight: '700', fontSize: '32px' }}>
                {searchResults && searchResults.organic ? searchResults.organic.length : 0}
              </h2>
            </div>
          </div>
        </div>
        <div className="col-md-6 col-lg-3">
          <div className="card" style={{ borderLeft: '4px solid #f59e0b' }}>
            <div className="card-body">
              <h6 className="card-title text-muted mb-2" style={{ fontSize: '13px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Reached Leads</h6>
              <h2 className="mb-0" style={{ color: '#f59e0b', fontWeight: '700', fontSize: '32px' }}>{reachedLeads}</h2>
            </div>
          </div>
        </div>
        <div className="col-md-6 col-lg-3">
          <div className="card" style={{ borderLeft: '4px solid #3b82f6' }}>
            <div className="card-body">
              <h6 className="card-title text-muted mb-2" style={{ fontSize: '13px', fontWeight: '500', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completed</h6>
              <h2 className="mb-0" style={{ color: '#3b82f6', fontWeight: '700', fontSize: '32px' }}>0</h2>
            </div>
          </div>
        </div>
      </div>

      {/* Search Section */}
      <div className="card">
        <div className="card-body">
          <h5 className="card-title mb-4" style={{ fontSize: '20px', fontWeight: '600' }}>Search</h5>
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <input
                type="text"
                className="form-control"
                placeholder="Enter search term..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
              />
            </div>
            <div className="col-12 col-md-4">
              <select
                className={`form-select ${!category ? 'is-invalid' : ''}`}
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                }}
                style={{ cursor: 'pointer' }}
                required
              >
                {categories.length === 0 ? (
                  <option value="" disabled>No categories available</option>
                ) : (
                  <>
                    <option value="">-- Select Category --</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
              {!category && categories.length > 0 && (
                <div className="invalid-feedback d-block">Please select a category</div>
              )}
              {categories.length === 0 && (
                <small className="text-muted d-block mt-1">Add categories in Settings page</small>
              )}
            </div>
            <div className="col-12 col-md-2">
              <button
                className="btn btn-primary w-100"
                onClick={handleSearch}
                disabled={!category || category.trim() === '' || categories.length === 0}
              >
                Search
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Search Results Table */}
      {loading && (
        <div className="text-center mt-4">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Searching pages...</p>
        </div>
      )}

      {searchResults && searchResults.organic && searchResults.organic.length > 0 && (
        <div className="card mt-4">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center mb-3">
              <div>
                <h5 className="card-title mb-0">Search Results - {searchResults.organic.length} results</h5>
                <small className={`${rateLimit.canSend ? 'text-success' : 'text-warning'}`}>
                  Rate Limit: {rateLimit.leadsSent}/{rateLimit.maxLeads} sent
                  {!rateLimit.canSend && ` • Next batch in ${rateLimit.minutesRemaining} min`}
                </small>
              </div>
              <div className="d-flex gap-2">
                <button
                  className="btn btn-outline-secondary"
                  onClick={handleDownloadCSV}
                  title="Download search results as CSV"
                >
                  ⬇ Download CSV
                </button>
                {selectedItems.size > 0 && (
                  <>
                    <button
                      className="btn btn-success"
                      onClick={handleSaveSelectedLeads}
                      disabled={savingLeads || sendingMessages}
                    >
                      {savingLeads ? 'Saving...' : `Save Selected (${selectedItems.size})`}
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={handleSendMessagesToSelected}
                      disabled={savingLeads || sendingMessages || !rateLimit.canSend || selectedItems.size > rateLimit.availableLeads}
                      title={!rateLimit.canSend ? `Rate limit reached. Wait ${rateLimit.minutesRemaining} minute(s).` : ''}
                    >
                      {sendingMessages ? 'Sending...' : `Send Messages (${selectedItems.size})`}
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="table-responsive">
              <table className="table table-striped table-hover">
                <thead>
                  <tr>
                    <th style={{ width: '50px' }}>
                      <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleSelectAll}
                        className="form-check-input"
                      />
                    </th>
                    <th>Title</th>
                    <th>Contact Number</th>
                    <th>Link</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.organic.map((result, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedItems.has(index)}
                          onChange={() => handleItemSelect(index)}
                          className="form-check-input"
                          disabled={selectedItems.size >= 10 && !selectedItems.has(index)}
                        />
                      </td>
                      <td>
                        <a
                          href={result.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-decoration-none fw-bold"
                        >
                          {result.title}
                        </a>
                      </td>
                      <td>
                        {result.phone || 'N/A'}
                      </td>
                      <td>
                        <a
                          href={result.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-decoration-none text-muted small"
                        >
                          {result.link}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {searchResults && (!searchResults.organic || searchResults.organic.length === 0) && (
        <div className="card mt-4">
          <div className="card-body">
            <p className="text-muted mb-0">No search results found.</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default Home;

