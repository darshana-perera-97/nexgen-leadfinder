import { useState, useEffect } from 'react';
import API_ENDPOINTS from '../config/api';

function Leads() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [selectedLeads, setSelectedLeads] = useState([]);
  const [sending, setSending] = useState(false);
  const [sendingProgress, setSendingProgress] = useState(null); // { totalGroups, currentGroup, totalLeads, sentLeads, failedLeads, nextGroupTime }
  const [rateLimit, setRateLimit] = useState({
    maxLeads: 10,
    leadsSent: 0,
    availableLeads: 10,
    canSend: true,
    minutesRemaining: 0
  });

  useEffect(() => {
    fetchLeads();
    fetchRateLimitStatus();
    // Poll rate limit status every 30 seconds
    const interval = setInterval(fetchRateLimitStatus, 30000);
    return () => clearInterval(interval);
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

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.LEADS);
      if (response.ok) {
        const data = await response.json();
        setLeads(data);
      } else {
        console.error('Error fetching leads');
      }
    } catch (error) {
      console.error('Error fetching leads:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate pagination
  const totalPages = Math.ceil(leads.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentLeads = leads.slice(startIndex, endIndex);

  // Handle page change
  const handlePageChange = (page) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Generate page numbers
  const getPageNumbers = () => {
    const pages = [];
    const maxPagesToShow = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
    let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

    if (endPage - startPage < maxPagesToShow - 1) {
      startPage = Math.max(1, endPage - maxPagesToShow + 1);
    }

    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  // Handle checkbox selection
  const handleSelectLead = (leadId) => {
    setSelectedLeads(prev => {
      if (prev.includes(leadId)) {
        return prev.filter(id => id !== leadId);
      } else {
        return [...prev, leadId];
      }
    });
  };

  // Handle select all
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedLeads(currentLeads.map(lead => lead.leadId));
    } else {
      setSelectedLeads([]);
    }
  };

  // Check if all current page leads are selected
  const isAllSelected = currentLeads.length > 0 && 
    currentLeads.every(lead => selectedLeads.includes(lead.leadId));

  // Batch leads into groups of 10
  const batchLeads = (leads, batchSize = 10) => {
    const batches = [];
    for (let i = 0; i < leads.length; i += batchSize) {
      batches.push(leads.slice(i, i + batchSize));
    }
    return batches;
  };

  // Send messages to selected leads in batches with 10-minute delays
  const handleSendMessages = async () => {
    if (selectedLeads.length === 0) {
      alert('Please select at least one lead to send messages');
      return;
    }

    if (!window.confirm(`Are you sure you want to send messages to ${selectedLeads.length} lead(s)?\n\nLeads will be sent in groups of 10 with 10-minute delays between groups.`)) {
      return;
    }

    // Batch leads into groups of 10
    const batches = batchLeads(selectedLeads, 10);
    const totalGroups = batches.length;
    let sentLeads = 0;
    let failedLeads = 0;

    // Initialize progress tracking
    setSendingProgress({
      totalGroups,
      currentGroup: 0,
      totalLeads: selectedLeads.length,
      sentLeads: 0,
      failedLeads: 0,
      nextGroupTime: null
    });
    setSending(true);

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
          const response = await fetch(API_ENDPOINTS.WHATSAPP_SEND_MESSAGES, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ leadIds: batch }),
          });

          if (response.ok) {
            const data = await response.json();
            sentLeads += data.summary.success || 0;
            failedLeads += data.summary.failed || 0;
            
            setSendingProgress(prev => ({
              ...prev,
              sentLeads: prev.sentLeads + (data.summary.success || 0),
              failedLeads: prev.failedLeads + (data.summary.failed || 0)
            }));

            // Refresh leads and rate limit status
            fetchLeads();
            fetchRateLimitStatus();
          } else {
            const error = await response.json();
            failedLeads += batch.length;
            setSendingProgress(prev => ({
              ...prev,
              failedLeads: prev.failedLeads + batch.length
            }));
            
            // If rate limit exceeded, we'll continue with next batch after wait time
            if (error.error === 'Rate limit exceeded') {
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
        `Total Leads: ${selectedLeads.length}\n` +
        `Successfully Sent: ${sentLeads}\n` +
        `Failed: ${failedLeads}\n` +
        `Groups Processed: ${totalGroups}`;
      
      alert(completionMessage);
      setSelectedLeads([]);
      
    } catch (error) {
      console.error('Error in batch sending:', error);
      alert('Error sending messages. Please try again.');
    } finally {
      setSending(false);
      setSendingProgress(null);
    }
  };

  return (
    <div className="container mt-4">
      <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
        <h2 style={{ fontWeight: '600', color: '#1e293b', marginBottom: 0 }}>Saved Leads</h2>
        <div className="d-flex flex-column flex-md-row align-items-stretch align-items-md-center gap-2 w-100 w-md-auto">
          <div className="d-flex flex-column align-items-center align-items-md-start">
            <span className="text-muted text-center text-md-start">Total: {leads.length} leads</span>
            <small className={`text-center text-md-start ${rateLimit.canSend ? 'text-success' : 'text-warning'}`}>
              Rate Limit: {rateLimit.leadsSent}/{rateLimit.maxLeads} sent
              {!rateLimit.canSend && ` • Next batch in ${rateLimit.minutesRemaining} min`}
            </small>
          </div>
          {selectedLeads.length > 0 && (
            <button
              className="btn btn-success"
              onClick={handleSendMessages}
              disabled={sending}
              title={sending ? 'Sending messages in batches...' : `Send ${selectedLeads.length} lead(s) in batches of 10`}
            >
              {sending ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                  Sending...
                </>
              ) : (
                `Send Messages (${selectedLeads.length})`
              )}
            </button>
          )}
        </div>
      </div>

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
                    {sendingProgress.totalLeads - sendingProgress.sentLeads - sendingProgress.failedLeads}
                  </strong>
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-2">
              <div className="d-flex justify-content-between align-items-center mb-1">
                <small className="text-muted" style={{ fontSize: '12px' }}>Overall Progress</small>
                <small className="text-muted" style={{ fontSize: '12px' }}>
                  {Math.round(((sendingProgress.sentLeads + sendingProgress.failedLeads) / sendingProgress.totalLeads) * 100)}%
                </small>
              </div>
              <div className="progress" style={{ height: '8px', borderRadius: '4px' }}>
                <div 
                  className="progress-bar bg-success" 
                  role="progressbar" 
                  style={{ 
                    width: `${((sendingProgress.sentLeads + sendingProgress.failedLeads) / sendingProgress.totalLeads) * 100}%`,
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

      {loading ? (
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-2">Loading leads...</p>
        </div>
      ) : leads.length === 0 ? (
        <div className="card">
          <div className="card-body text-center">
            <p className="text-muted mb-0">No leads saved yet.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="card">
            <div className="card-body">
              <div className="table-responsive">
                <table className="table table-striped table-hover">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={isAllSelected}
                          onChange={handleSelectAll}
                          className="form-check-input"
                        />
                      </th>
                      <th>Lead ID</th>
                      <th>Business Name</th>
                      <th>Contact Number</th>
                      <th>Email</th>
                      <th>Link</th>
                      <th>Search Phrase</th>
                      <th>Category</th>
                      <th>Saved Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentLeads.map((lead) => (
                      <tr key={lead.leadId}>
                        <td>
                          <input
                            type="checkbox"
                            checked={selectedLeads.includes(lead.leadId)}
                            onChange={() => handleSelectLead(lead.leadId)}
                            className="form-check-input"
                            disabled={lead.reached || lead.messageSent || sending}
                          />
                        </td>
                        <td>
                          <small className="text-muted">{lead.leadId}</small>
                        </td>
                        <td>{lead.businessName}</td>
                        <td>{lead.contactNumber || 'N/A'}</td>
                        <td>{lead.emailId || 'N/A'}</td>
                        <td>
                          {lead.website ? (
                            <a
                              href={lead.website}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-decoration-none"
                            >
                              Link
                            </a>
                          ) : (
                            'N/A'
                          )}
                        </td>
                        <td>
                          <span className="badge bg-secondary">
                            {lead.searchPhrase}
                          </span>
                        </td>
                        <td>
                          {lead.category ? (
                            <span className="badge bg-primary">{lead.category}</span>
                          ) : (
                            <span className="text-muted">-</span>
                          )}
                        </td>
                        <td>
                          <small>
                            {new Date(lead.savedDate).toLocaleString()}
                          </small>
                        </td>
                        <td>
                          {lead.messageSent ? (
                            <span className="badge bg-success">Message Sent</span>
                          ) : lead.reached ? (
                            <span className="badge bg-warning">Reached</span>
                          ) : (
                            <span className="badge bg-secondary">Pending</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <nav aria-label="Leads pagination" className="mt-4">
              <ul className="pagination justify-content-center">
                <li className={`page-item ${currentPage === 1 ? 'disabled' : ''}`}>
                  <button
                    className="page-link"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </button>
                </li>

                {getPageNumbers().map((page) => (
                  <li
                    key={page}
                    className={`page-item ${currentPage === page ? 'active' : ''}`}
                  >
                    <button
                      className="page-link"
                      onClick={() => handlePageChange(page)}
                    >
                      {page}
                    </button>
                  </li>
                ))}

                <li className={`page-item ${currentPage === totalPages ? 'disabled' : ''}`}>
                  <button
                    className="page-link"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Next
                  </button>
                </li>
              </ul>
            </nav>
          )}

          {/* Page info */}
          <div className="text-center mt-3">
            <small className="text-muted">
              Showing {startIndex + 1} to {Math.min(endIndex, leads.length)} of {leads.length} leads
            </small>
          </div>
        </>
      )}
    </div>
  );
}

export default Leads;

