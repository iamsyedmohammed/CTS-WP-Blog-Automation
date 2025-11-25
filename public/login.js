// Toggle password visibility
document.getElementById('togglePassword').addEventListener('click', function() {
    const passwordInput = document.getElementById('password');
    const toggleIcon = this.querySelector('.dashicons');
    
    if (passwordInput.type === 'password') {
        passwordInput.type = 'text';
        toggleIcon.classList.remove('dashicons-visibility');
        toggleIcon.classList.add('dashicons-hidden');
        this.setAttribute('aria-label', 'Hide password');
    } else {
        passwordInput.type = 'password';
        toggleIcon.classList.remove('dashicons-hidden');
        toggleIcon.classList.add('dashicons-visibility');
        this.setAttribute('aria-label', 'Show password');
    }
});

// Handle form submission
document.getElementById('loginForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const rememberme = document.getElementById('rememberme').checked;
    const errorMessage = document.getElementById('errorMessage');
    
    // Clear previous errors
    errorMessage.style.display = 'none';
    errorMessage.textContent = '';
    
    try {
        const response = await fetch('/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                username: username,
                password: password,
                rememberme: rememberme ? 'forever' : ''
            }),
            credentials: 'include' // Include cookies
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
            // Redirect to main page
            window.location.href = '/';
        } else {
            // Show error message
            errorMessage.textContent = data.error || 'Invalid username or password';
            errorMessage.style.display = 'block';
        }
    } catch (error) {
        errorMessage.textContent = 'An error occurred. Please try again.';
        errorMessage.style.display = 'block';
    }
});

