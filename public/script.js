const form = document.getElementById('uploadForm');
const fileInput = document.getElementById('csvFile');
const uploadBtn = document.getElementById('uploadBtn');
const progressSection = document.getElementById('progressSection');
const progressText = document.getElementById('progressText');
const resultSection = document.getElementById('resultSection');
const errorSection = document.getElementById('errorSection');
const errorMessage = document.getElementById('errorMessage');

const fileLabel = document.getElementById('fileLabel');
const fileText = document.getElementById('fileText');
const selectedFileInfo = document.getElementById('selectedFileInfo');
const selectedFileName = document.getElementById('selectedFileName');
const clearFileBtn = document.getElementById('clearFileBtn');

// Show selected file name and lock selection
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        // Hide the label, show selected file info
        fileLabel.style.display = 'none';
        selectedFileInfo.style.display = 'block';
        selectedFileName.textContent = file.name;
        
        // Disable the file input to prevent accidental changes
        fileInput.disabled = true;
    } else {
        // Reset to default state
        fileLabel.style.display = 'flex';
        selectedFileInfo.style.display = 'none';
        fileInput.disabled = false;
    }
});

// Clear file selection
clearFileBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Reset file input
    fileInput.value = '';
    fileInput.disabled = false;
    
    // Show label again, hide selected file info
    fileLabel.style.display = 'flex';
    selectedFileInfo.style.display = 'none';
    
    // Reset form if needed
    if (resultSection.style.display !== 'none') {
        resultSection.style.display = 'none';
    }
});

// Handle form submission
form.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const file = fileInput.files[0];
    if (!file) {
        showError('<i class="fas fa-exclamation-circle"></i> Please select a CSV file before uploading');
        // Scroll to error section
        errorSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight the file input area
        const fileLabel = document.getElementById('fileLabel');
        if (fileLabel) {
            fileLabel.style.borderColor = '#dc3545';
            fileLabel.style.animation = 'shake 0.5s';
            setTimeout(() => {
                fileLabel.style.borderColor = '#000000';
                fileLabel.style.animation = '';
            }, 500);
        }
        return;
    }

    // Hide previous results/errors
    resultSection.style.display = 'none';
    errorSection.style.display = 'none';
    
    // Lock file input during upload
    fileInput.disabled = true;
    
    // Show progress
    progressSection.style.display = 'block';
    progressText.textContent = '';
    const progressMessages = document.getElementById('progressMessages');
    if (progressMessages) {
        progressMessages.innerHTML = '';
    }
    
    // Disable form
    uploadBtn.disabled = true;
    uploadBtn.querySelector('.btn-text').style.display = 'none';
    uploadBtn.querySelector('.btn-loader').style.display = 'inline';

    try {
        // Generate session ID and connect to SSE FIRST
        const sessionId = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
        const eventSource = connectToProgress(sessionId);
        
        const formData = new FormData();
        formData.append('csvfile', file);
        formData.append('sessionId', sessionId);

        const response = await fetch('/upload', {
            method: 'POST',
            body: formData
        });
        
        const data = await response.json();
        
        // Close SSE connection after processing is complete
        if (eventSource) {
            setTimeout(() => {
                eventSource.close();
            }, 1000);
        }
        
        progressText.textContent = 'Processing complete!';

        if (data.success) {
            setTimeout(() => {
                showResults(data.result);
            }, 500);
        } else {
            showError(data.error || 'Upload failed');
        }
    } catch (error) {
        showError('Error: ' + error.message);
    } finally {
        // Re-enable form
        uploadBtn.disabled = false;
        uploadBtn.querySelector('.btn-text').style.display = 'inline';
        uploadBtn.querySelector('.btn-loader').style.display = 'none';
        progressSection.style.display = 'none';
        
        // Re-enable file input after upload completes
        if (fileInput.files.length > 0) {
            fileInput.disabled = true; // Keep disabled if file is still selected
        } else {
            fileInput.disabled = false;
        }
    }
});

function showResults(result) {
    // Update stats
    document.getElementById('successCount').textContent = result.success;
    document.getElementById('failedCount').textContent = result.failed;
    document.getElementById('totalCount').textContent = result.total;
    document.getElementById('duration').textContent = result.duration + 's';

    // Build results table
    const table = document.createElement('table');
    table.innerHTML = `
        <thead>
            <tr>
                <th>Row</th>
                <th>Title</th>
                <th>Action</th>
                <th>Post Status</th>
                <th>Post ID</th>
                <th>Error</th>
            </tr>
        </thead>
        <tbody>
            ${result.results.map(r => {
                const postStatus = r.status || '-';
                const postStatusClass = postStatus === 'publish' ? 'status-published' : 
                                      postStatus === 'draft' ? 'status-draft' : '';
                const postStatusDisplay = postStatus === 'publish' ? '📢 Published' : 
                                         postStatus === 'draft' ? '📝 Draft' : 
                                         postStatus === 'private' ? '🔒 Private' :
                                         postStatus === 'pending' ? '⏳ Pending' : postStatus;
                
                return `
                <tr>
                    <td>${r.rowNumber}</td>
                    <td>${r.title}</td>
                    <td class="${r.error ? 'status-failed' : 'status-success'}">
                        ${r.error ? '<i class="fas fa-times-circle"></i> Failed' : '<i class="fas fa-check-circle"></i> ' + (r.action || 'Success')}
                    </td>
                    <td class="${postStatusClass}">
                        ${postStatus === 'publish' ? '<i class="fas fa-globe"></i> Published' : 
                         postStatus === 'draft' ? '<i class="fas fa-file-alt"></i> Draft' : 
                         postStatus === 'private' ? '<i class="fas fa-lock"></i> Private' :
                         postStatus === 'pending' ? '<i class="fas fa-clock"></i> Pending' : postStatus}
                    </td>
                    <td>${r.postId || '-'}</td>
                    <td>${r.error || '-'}</td>
                </tr>
            `;
            }).join('')}
        </tbody>
    `;

    const resultsTable = document.getElementById('resultsTable');
    resultsTable.innerHTML = '';
    resultsTable.appendChild(table);

    resultSection.style.display = 'block';
    resultSection.scrollIntoView({ behavior: 'smooth' });
}

function connectToProgress(sessionId) {
    const eventSource = new EventSource(`/progress/${sessionId}`);
    const progressMessages = document.getElementById('progressMessages');
    
    if (!progressMessages) {
        console.error('Progress messages container not found');
        return eventSource;
    }
    
    eventSource.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'connected') {
                return;
            }
            
            // Create message element
            const messageDiv = document.createElement('div');
            messageDiv.className = `progress-message ${data.type}`;
            
            let icon = '';
            if (data.type === 'success') {
                icon = '<i class="fas fa-check-circle"></i>';
            } else if (data.type === 'error') {
                icon = '<i class="fas fa-times-circle"></i>';
            } else {
                icon = '<i class="fas fa-info-circle"></i>';
            }
            
            messageDiv.innerHTML = `${icon} ${data.message}`;
            progressMessages.appendChild(messageDiv);
            
            // Auto-scroll to bottom
            progressMessages.scrollTop = progressMessages.scrollHeight;
        } catch (error) {
            console.error('Error parsing progress message:', error);
        }
    };
    
    eventSource.onerror = (error) => {
        console.error('SSE error:', error);
        // Don't close on error, might reconnect
    };
    
    return eventSource;
}

function showError(message) {
    errorMessage.innerHTML = message;
    errorSection.style.display = 'block';
    errorSection.scrollIntoView({ behavior: 'smooth' });
}

// Logout functionality
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            const response = await fetch('/logout', {
                method: 'POST',
                credentials: 'include'
            });
            
            if (response.ok) {
                window.location.href = '/login.html';
            }
        } catch (error) {
            console.error('Logout error:', error);
            // Still redirect to login page
            window.location.href = '/login.html';
        }
    });
}

