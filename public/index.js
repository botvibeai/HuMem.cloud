document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const userIdInput = document.getElementById('user-id-input');
  const saveUserBtn = document.getElementById('save-user-btn');
  const userStatus = document.getElementById('user-status');
  
  const ingestForm = document.getElementById('ingest-form');
  const memoryContent = document.getElementById('memory-content');
  const memoryRole = document.getElementById('memory-role');
  const ingestSubmitBtn = document.getElementById('ingest-submit-btn');
  const ingestResult = document.getElementById('ingest-result');
  
  const queryInput = document.getElementById('query-input');
  const queryBtn = document.getElementById('query-btn');
  const recallResult = document.getElementById('recall-result');

  let activeUserId = '';

  // Load saved session
  const savedUserId = localStorage.getItem('humem_user_id');
  if (savedUserId) {
    userIdInput.value = savedUserId;
    lockSession(savedUserId);
  }

  // Session handler
  saveUserBtn.addEventListener('click', () => {
    const userId = userIdInput.value.trim();
    if (!userId) {
      alert('Please enter a valid User ID');
      return;
    }
    lockSession(userId);
  });

  function lockSession(userId) {
    activeUserId = userId;
    localStorage.setItem('humem_user_id', userId);
    
    // Update UI status
    userStatus.innerHTML = `✅ Session active for User ID: <strong>${escapeHtml(userId)}</strong>`;
    userStatus.classList.remove('status-hint');
    userStatus.style.color = 'var(--success-glow)';
    
    // Enable fields
    memoryContent.disabled = false;
    memoryRole.disabled = false;
    ingestSubmitBtn.disabled = false;
    queryInput.disabled = false;
    queryBtn.disabled = false;
  }

  // Ingest Memory
  ingestForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeUserId) return;

    const content = memoryContent.value.trim();
    const role = memoryRole.value;

    if (!content) return;

    // Show loading state
    setLoading(ingestSubmitBtn, true, 'Remembering...');
    ingestResult.classList.add('hidden');

    try {
      const token = localStorage.getItem('humem_jwt') || 'demo_token';
      const response = await fetch('/v1/memory/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          fact: content,
          category: role,
          valid_from: new Date().toISOString(),
          importance: 0.8,
          scope: 'tenant-local',
          modality: 'text'
        })
      });

      const data = await response.json();

      if (response.ok && data.success) {
        ingestResult.className = 'result-box ingest-success';
        
        let factsHtml = '';
        if (data.facts && data.facts.length > 0) {
          factsHtml = '<p style="margin-top:8px; font-weight:600;">Extracted Knowledge:</p>';
          data.facts.forEach(f => {
            const actionGlow = f.action === 'ADD' ? '#10b981' : '#06b6d4';
            factsHtml += `
              <div style="margin: 6px 0; border-left: 2px solid ${actionGlow}; padding-left: 8px;">
                <span class="fact-badge">${escapeHtml(f.entity)} &rarr; ${escapeHtml(f.relationship)} &rarr; ${escapeHtml(f.value)}</span>
                <span style="font-size:11px; color:var(--text-muted);">(${f.action} - Confidence: ${(f.confidence * 100).toFixed(0)}%)</span>
              </div>
            `;
          });
        } else {
          factsHtml = '<p style="font-size:12px; color:var(--text-muted); margin-top:8px;">No new facts extracted (information was duplicate or generic).</p>';
        }

        ingestResult.innerHTML = `
          <h4>✅ Memory Ingested</h4>
          <p>The raw message has been added to episodic history.</p>
          ${factsHtml}
        `;
        memoryContent.value = '';
      } else {
        throw new Error(data.error || 'Failed to ingest memory');
      }
    } catch (err) {
      ingestResult.className = 'result-box';
      ingestResult.innerHTML = `<span style="color:var(--error-glow);">❌ Error: ${escapeHtml(err.message)}</span>`;
    } finally {
      setLoading(ingestSubmitBtn, false, 'Remember Fact');
      ingestResult.classList.remove('hidden');
    }
  });

  // Recall Memory (Hybrid Query)
  queryBtn.addEventListener('click', async () => {
    const query = queryInput.value.trim();
    if (!query || !activeUserId) return;

    // Show loading
    setLoading(queryBtn, true, 'Searching...');
    recallResult.classList.add('hidden');

    try {
      const token = localStorage.getItem('humem_jwt') || 'demo_token';
      const response = await fetch('/v1/memory/query', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          query_string: query,
          current_time: new Date().toISOString(),
          scope: 'tenant-local'
        })
      });
      const data = await response.json();

      if (response.ok) {
        recallResult.innerHTML = '';
        
        // Render Semantic Vector Results
        let semanticHtml = `<div class="recall-section">
          <div class="recall-section-title">Semantic Context (Vectorize)</div>`;
        if (data.semanticResults && data.semanticResults.length > 0) {
          data.semanticResults.forEach(match => {
            const percentage = (match.score ? match.score * 100 : 0).toFixed(1);
            const meta = match.metadata || {};
            semanticHtml += `
              <div class="semantic-card">
                <p><strong>${escapeHtml(meta.entity || '')}</strong> ${escapeHtml(meta.relationship || '')} &rarr; ${escapeHtml(meta.value || '')}</p>
                <div class="semantic-meta">
                  <span>ID: ${escapeHtml(match.id)}</span>
                  <span class="similarity-badge">Match Score: ${percentage}%</span>
                </div>
              </div>
            `;
          });
        } else {
          semanticHtml += `<p style="color:var(--text-muted); font-size:13px; padding: 8px 0;">No semantic vector matches found.</p>`;
        }
        semanticHtml += '</div>';

        // Render Relational SQLite Facts
        let relationalHtml = `<div class="recall-section">
          <div class="recall-section-title">Knowledge Graph (SQLite Facts)</div>`;
        if (data.results && data.results.length > 0) {
          relationalHtml += `
            <table class="relational-table">
              <thead>
                <tr>
                  <th>Fact</th>
                  <th>Category</th>
                  <th>Score</th>
                </tr>
              </thead>
              <tbody>
          `;
          data.results.forEach(fact => {
            relationalHtml += `
              <tr>
                <td><strong>${escapeHtml(fact.fact)}</strong></td>
                <td>${escapeHtml(fact.category)}</td>
                <td>${escapeHtml(String(fact.importance))}</td>
              </tr>
            `;
          });
          relationalHtml += `
              </tbody>
            </table>
          `;
        } else {
          relationalHtml += `<p style="color:var(--text-muted); font-size:13px; padding: 8px 0;">No relational facts stored in database yet.</p>`;
        }
        relationalHtml += '</div>';

        recallResult.innerHTML = semanticHtml + relationalHtml;
      } else {
        throw new Error(data.error || 'Failed to search memory');
      }
    } catch (err) {
      recallResult.innerHTML = `<span style="color:var(--error-glow);">❌ Error: ${escapeHtml(err.message)}</span>`;
    } finally {
      setLoading(queryBtn, false, 'Search');
      recallResult.classList.remove('hidden');
    }
  });

  // Utilities
  function setLoading(btn, isLoading, text) {
    if (isLoading) {
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner"></span> ${text}`;
    } else {
      btn.disabled = false;
      btn.innerHTML = text;
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
});
