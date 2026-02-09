import { useState, useEffect } from 'react';
import API_ENDPOINTS from '../config/api';

function Messages() {
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const [messages, setMessages] = useState(['', '']); // Array of message strings
  const [sendGreeting, setSendGreeting] = useState(true); // Default to true for backward compatibility
  const [loading, setLoading] = useState(false);
  const [savedMessages, setSavedMessages] = useState([]);
  const [showSidePanel, setShowSidePanel] = useState(false);
  const [activeTextareaIndex, setActiveTextareaIndex] = useState(null);
  const [showPlaceholders, setShowPlaceholders] = useState(false);

  useEffect(() => {
    fetchCategories();
    fetchMessages();
  }, []);

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

  const fetchMessages = async () => {
    try {
      const response = await fetch(API_ENDPOINTS.MESSAGES);
      if (response.ok) {
        const data = await response.json();
        setSavedMessages(data);
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  };

  const handleCategoryChange = (category) => {
    setSelectedCategory(category);
  };

  // Load messages into textareas when category or savedMessages change
  useEffect(() => {
    if (selectedCategory && savedMessages.length > 0) {
      const existing = savedMessages.find(msg => msg.category === selectedCategory);
      if (existing) {
        // Load messages from existing data - support both old format (type1) and new format (messages array)
        if (existing.messages && Array.isArray(existing.messages)) {
          setMessages(existing.messages.length > 0 ? existing.messages : ['', '']);
        } else {
          // Legacy format: convert type1 messages to array
          const msgArray = [];
          if (existing.type1?.message1) msgArray.push(existing.type1.message1);
          if (existing.type1?.message2) msgArray.push(existing.type1.message2);
          setMessages(msgArray.length > 0 ? msgArray : ['', '']);
        }
        // Load sendGreeting preference (default to true if not set for backward compatibility)
        setSendGreeting(existing.sendGreeting !== undefined ? existing.sendGreeting : true);
      } else {
        // Clear fields if no existing messages for this category
        setMessages(['', '']);
        setSendGreeting(true);
      }
    } else if (!selectedCategory) {
      // Clear fields if no category selected
      setMessages(['', '']);
      setSendGreeting(true);
    }
  }, [selectedCategory, savedMessages]);

  const addMessage = () => {
    setMessages([...messages, '']);
  };

  const removeMessage = (index) => {
    if (messages.length > 1) {
      const newMessages = messages.filter((_, i) => i !== index);
      setMessages(newMessages);
    }
  };

  const updateMessage = (index, value) => {
    const newMessages = [...messages];
    newMessages[index] = value;
    setMessages(newMessages);
  };

  const insertPlaceholder = (placeholder) => {
    if (activeTextareaIndex !== null && activeTextareaIndex >= 0 && activeTextareaIndex < messages.length) {
      const textarea = document.querySelector(`textarea[data-index="${activeTextareaIndex}"]`);
      if (textarea) {
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const text = messages[activeTextareaIndex];
        const newText = text.substring(0, start) + placeholder + text.substring(end);
        updateMessage(activeTextareaIndex, newText);
        
        // Set cursor position after inserted placeholder
        setTimeout(() => {
          textarea.focus();
          textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
        }, 0);
      }
    }
    setShowPlaceholders(false);
  };

  const placeholders = [
    { name: 'Name', value: '{name}' },
    { name: 'Company', value: '{company}' },
    { name: 'Website', value: '{website}' },
    { name: 'Email', value: '{email}' },
    { name: 'Phone', value: '{phone}' },
    { name: 'Category', value: '{category}' }
  ];

  const handleSave = async (e) => {
    e.preventDefault();
    
    if (!selectedCategory) {
      alert('Please select a category');
      return;
    }

    // Filter out empty messages and validate
    const validMessages = messages.filter(msg => msg.trim() !== '');
    if (validMessages.length === 0) {
      alert('Please add at least one message');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(API_ENDPOINTS.MESSAGES, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          category: selectedCategory,
          messages: validMessages,
          sendGreeting: sendGreeting
        }),
      });

      if (response.ok) {
        const data = await response.json();
        alert('Messages saved successfully!');
        // Refresh messages list to update the state
        await fetchMessages();
      } else {
        const error = await response.json();
        alert(error.error || 'Error saving messages');
      }
    } catch (error) {
      console.error('Error saving messages:', error);
      alert('Error saving messages');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mt-4">
      <div className="row">
        {/* Main Content Area */}
        <div className={showSidePanel ? "col-lg-8 col-12" : "col-12"}>
          <div className="d-flex flex-column flex-md-row justify-content-between align-items-start align-items-md-center mb-4 gap-3">
            <div>
              <h2 className="mb-1" style={{ fontWeight: '600', color: '#1e293b' }}>Messages</h2>
              <p className="text-muted mb-0 d-none d-md-block" style={{ fontSize: '14px' }}>Manage your WhatsApp message templates by category</p>
            </div>
            <button
              className="btn btn-outline-secondary w-100 w-md-auto"
              onClick={() => setShowSidePanel(!showSidePanel)}
              style={{ borderRadius: '10px' }}
            >
              {showSidePanel ? '← Hide' : 'View All →'}
            </button>
          </div>

          {/* Category Selection */}
          <div className="card mb-4">
            <div className="card-body">
              <div className="d-flex align-items-center mb-3">
                <div style={{ width: '4px', height: '24px', background: '#6366f1', borderRadius: '2px', marginRight: '12px' }}></div>
                <h5 className="card-title mb-0" style={{ fontWeight: '600', fontSize: '18px' }}>Select Category</h5>
              </div>
              <select
                className="form-select"
                value={selectedCategory}
                onChange={(e) => handleCategoryChange(e.target.value)}
                style={{ fontSize: '15px' }}
              >
                <option value="">-- Choose a category --</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.name}>
                    {cat.name}
                  </option>
                ))}
              </select>
              {categories.length === 0 && (
                <small className="text-muted d-block mt-2">
                  <i className="bi bi-info-circle"></i> No categories available. Add categories in Settings.
                </small>
              )}
            </div>
          </div>

          {/* Message Forms */}
          {selectedCategory ? (
            <form onSubmit={handleSave}>
              {/* Messages */}
              <div className="card mb-4" style={{ borderLeft: '4px solid #6366f1' }}>
                <div className="card-body">
                  <div className="d-flex align-items-center justify-content-between mb-4">
                    <div>
                      <h5 className="card-title mb-1" style={{ fontWeight: '600', fontSize: '18px', color: '#6366f1' }}>
                        Messages
                      </h5>
                      <small className="text-muted">Create your WhatsApp message templates</small>
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-primary"
                        onClick={() => setShowPlaceholders(!showPlaceholders)}
                        style={{ borderRadius: '8px', fontSize: '13px' }}
                      >
                        📋 Placeholders
                      </button>
                      <button
                        type="button"
                        className="btn btn-sm btn-success"
                        onClick={addMessage}
                        style={{ borderRadius: '8px', fontSize: '13px' }}
                      >
                        + Add Message
                      </button>
                    </div>
                  </div>

                  {/* Greeting Option */}
                  <div className="mb-4 p-3" style={{ background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <div className="form-check">
                      <input
                        className="form-check-input"
                        type="checkbox"
                        id="sendGreeting"
                        checked={sendGreeting}
                        onChange={(e) => setSendGreeting(e.target.checked)}
                        style={{ cursor: 'pointer' }}
                      />
                      <label className="form-check-label" htmlFor="sendGreeting" style={{ cursor: 'pointer', fontSize: '14px', fontWeight: '500' }}>
                        Send greeting message (e.g., "Hi Good Morning")
                      </label>
                      <small className="text-muted d-block mt-1" style={{ fontSize: '12px', marginLeft: '24px' }}>
                        When enabled, a greeting message will be sent before your custom messages
                      </small>
                    </div>
                  </div>

                  {/* Placeholders Dropdown */}
                  {showPlaceholders && (
                    <div className="mb-4 p-3" style={{ background: '#f8f9fa', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                      <div className="d-flex align-items-center mb-2">
                        <small style={{ fontWeight: '600', fontSize: '12px', color: '#64748b' }}>Available Placeholders:</small>
                      </div>
                      <div className="d-flex flex-wrap gap-2">
                        {placeholders.map((placeholder) => (
                          <button
                            key={placeholder.value}
                            type="button"
                            className="btn btn-sm btn-outline-secondary"
                            onClick={() => insertPlaceholder(placeholder.value)}
                            style={{ fontSize: '12px', padding: '4px 12px' }}
                          >
                            {placeholder.name} ({placeholder.value})
                          </button>
                        ))}
                      </div>
                      <small className="text-muted d-block mt-2" style={{ fontSize: '11px' }}>
                        Click on a message field first, then click a placeholder to insert it
                      </small>
                    </div>
                  )}
                  
                  {messages.map((message, index) => (
                    <div key={index} className={index < messages.length - 1 ? "mb-4" : "mb-0"}>
                      <label className="form-label d-flex justify-content-between align-items-center mb-2">
                        <span style={{ fontWeight: '500', fontSize: '14px' }}>Message {index + 1}</span>
                        <div className="d-flex align-items-center gap-2">
                          <small className="text-muted" style={{ fontSize: '12px' }}>{message.length} characters</small>
                          {messages.length > 1 && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => removeMessage(index)}
                              style={{ padding: '2px 8px', fontSize: '11px' }}
                              title="Remove this message"
                            >
                              ×
                            </button>
                          )}
                        </div>
                      </label>
                      <textarea
                        data-index={index}
                        className="form-control"
                        rows="4"
                        value={message}
                        onChange={(e) => updateMessage(index, e.target.value)}
                        onFocus={() => setActiveTextareaIndex(index)}
                        placeholder={`Enter message ${index + 1}...`}
                        required
                        style={{ fontSize: '14px', lineHeight: '1.6' }}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Save Button */}
              <div className="mb-4">
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                  style={{ padding: '12px 32px', fontSize: '15px', fontWeight: '500' }}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                      Saving...
                    </>
                  ) : (
                    '💾 Save Messages'
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="card">
              <div className="card-body text-center py-5">
                <div style={{ fontSize: '48px', marginBottom: '16px' }}>📝</div>
                <h5 className="mb-2" style={{ color: '#64748b' }}>No Category Selected</h5>
                <p className="text-muted mb-0" style={{ fontSize: '14px' }}>
                  Select a category from the dropdown above to start creating or editing messages
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Side Panel - View Messages */}
        {showSidePanel && (
          <div className="col-lg-4 col-12 mt-4 mt-lg-0">
            <div className="card" style={{ position: 'sticky', top: '20px', maxHeight: 'calc(100vh - 40px)' }}>
              <div className="card-header d-flex justify-content-between align-items-center" style={{ background: '#f8f9fa', borderBottom: '1px solid #e2e8f0', padding: '16px 20px' }}>
                <div>
                  <h5 className="mb-0" style={{ fontWeight: '600', fontSize: '16px' }}>All Messages</h5>
                  <small className="text-muted" style={{ fontSize: '12px' }}>{savedMessages.length} {savedMessages.length === 1 ? 'category' : 'categories'}</small>
                </div>
                <button
                  className="btn btn-sm"
                  onClick={() => setShowSidePanel(false)}
                  aria-label="Close"
                  style={{ background: 'transparent', border: 'none', fontSize: '20px', color: '#64748b', padding: '0', width: '24px', height: '24px' }}
                >
                  ×
                </button>
              </div>
              <div className="card-body" style={{ maxHeight: 'calc(100vh - 200px)', overflowY: 'auto', padding: '20px' }}>
                {savedMessages.length === 0 ? (
                  <div className="text-center py-5">
                    <div style={{ fontSize: '48px', marginBottom: '16px', opacity: '0.5' }}>📭</div>
                    <p className="text-muted mb-0" style={{ fontSize: '14px' }}>No messages saved yet</p>
                    <small className="text-muted d-block mt-2">Create messages using the form on the left</small>
                  </div>
                ) : (
                  savedMessages.map((msg, index) => (
                    <div 
                      key={msg.id} 
                      className="mb-4 pb-4"
                      style={{ 
                        borderBottom: index < savedMessages.length - 1 ? '1px solid #e2e8f0' : 'none',
                        paddingBottom: index < savedMessages.length - 1 ? '20px' : '0'
                      }}
                    >
                      <div className="d-flex align-items-center justify-content-between mb-3">
                        <h6 className="mb-0" style={{ fontWeight: '600', fontSize: '15px', color: '#1e293b' }}>
                          {msg.category}
                        </h6>
                        <div className="d-flex gap-2 align-items-center">
                          {msg.sendGreeting !== false && (
                            <span className="badge" style={{ background: '#d1fae5', color: '#065f46', fontSize: '10px', padding: '4px 8px' }}>
                              👋 Greeting
                            </span>
                          )}
                          <span className="badge" style={{ background: '#e0e7ff', color: '#6366f1', fontSize: '10px', padding: '4px 8px' }}>
                            Active
                          </span>
                        </div>
                      </div>
                      
                      {/* Messages */}
                      <div className="mb-3">
                        <div className="d-flex align-items-center mb-2">
                          <div style={{ width: '3px', height: '16px', background: '#6366f1', borderRadius: '2px', marginRight: '8px' }}></div>
                          <small className="text-muted" style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Messages ({msg.messages?.length || (msg.type1 ? 2 : 0)})
                          </small>
                        </div>
                        {(msg.messages && Array.isArray(msg.messages) ? msg.messages : 
                          (msg.type1 ? [msg.type1.message1, msg.type1.message2].filter(Boolean) : [])
                        ).map((message, msgIndex) => (
                          <div 
                            key={msgIndex}
                            style={{ 
                              background: '#f0f4ff', 
                              border: '1px solid #e0e7ff', 
                              borderRadius: '8px', 
                              padding: '12px', 
                              marginBottom: msgIndex < (msg.messages?.length || 2) - 1 ? '8px' : '0' 
                            }}
                          >
                            <small style={{ color: '#6366f1', fontWeight: '500', fontSize: '11px', display: 'block', marginBottom: '6px' }}>
                              Message {msgIndex + 1}
                            </small>
                            <p className="mb-0" style={{ fontSize: '13px', color: '#1e293b', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                              {message?.substring(0, 80) || ''}{message?.length > 80 ? '...' : ''}
                            </p>
                          </div>
                        ))}
                      </div>

                      <button
                        className="btn btn-sm w-100"
                        onClick={() => {
                          setSelectedCategory(msg.category);
                          setShowSidePanel(false);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        style={{ 
                          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                          color: 'white',
                          border: 'none',
                          borderRadius: '8px',
                          padding: '8px',
                          fontSize: '13px',
                          fontWeight: '500',
                          marginTop: '12px'
                        }}
                      >
                        ✏️ Edit Messages
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Messages;

