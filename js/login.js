const accessToken = localStorage.getItem('accessToken')

if (accessToken) {
    window.location.replace('index.html')
}

const form = document.getElementById('login-form')

form.addEventListener('submit', (event) => {
    event.preventDefault()

    const login = document.getElementById('user-login').value
    const password = document.getElementById('user-password').value

    const body = {
        login: login,
        password: password
    }

    fetch('http://localhost:8080/api/v1/auth/login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        // mode: 'same-origin',
        body: JSON.stringify(body)
    }).then(res => {
        if (res.status === 200) {
            res.json().then(data => {
                console.log(data)
                localStorage.setItem('accessToken', data.access)
                localStorage.setItem('refreshToken', data.refresh)
                window.location.replace('index.html')
            })
            
            return
        }
        
        res.json().then(data => {
            const message = data.message
            document.getElementById('form-error').innerText = message
        })
    })
})
