import { Client } from '@stomp/stompjs'

const host = 'localhost:8080'

let accessToken = localStorage.getItem('accessToken')
let refreshToken = localStorage.getItem('refreshToken')

let accessData = null
let user = null
let anotherUser = null
let conversations = []
let currentConversation = null

let client = null

const form = document.getElementById('chat-form')
form.addEventListener('submit', formCallback)

const logOutButton = document.getElementById('log-out-button')
logOutButton.addEventListener('click', (e) => {
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  window.location.replace('login.html')
})

const newButton = document.getElementById('new-button')
newButton.addEventListener('click', async (e) => {
  const username = prompt('Enter username')
  if (!username) {
    return
  }

  refresh(() => {})

  const response = await fetch(`http://${host}/api/v1/users/byUsername/${username}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
  })
  if (response.status !== 200) {
    return
  }

  const body = await response.json()
  client.publish({
    destination: '/app/conversation',
    body: JSON.stringify({
      'first_user_id': user.id,
      'second_user_id': body.id
    })
  })
})

if (!refreshToken) {
  window.location.replace('login.html')
}

if (!accessToken) {
  refresh(startClient)
}

checkAccessToken()

function refresh(whenOk) {
  console.log('Refresh tokens...')
  const body = {
    refresh: refreshToken
  }

  fetch(`http://${host}/api/v1/auth/refresh`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  }).then(res => {
    if (res.status === 200) {
      res.json().then(data => {
        accessToken = data.access
        refreshToken = data.refresh

        localStorage.setItem('accessToken', accessToken)
        localStorage.setItem('refreshToken', refreshToken)

        console.log('Done')

        whenOk()
      })
      return
    }

    localStorage.removeItem('accessToken')
    localStorage.removeItem('refreshToken')

    window.location.replace('login.html')
  })
}

function checkAccessToken() {
  setAccessData()

  const exp = accessData.exp * 1000 // to milliseconds
  const now = Date.now()
  if (now > exp) {
    console.log('accessToken is outdated')
    refresh(startClient)
    return
  }

  startClient()
}

function setAccessData() {
  const dataBase64 = accessToken.split('.')[1]
  accessData = JSON.parse(atob(dataBase64))
}

async function init() {
  console.log('Start initialization')

  await initUser()
  await initConversations()
  await loadMessages()

  await initUI()
  
  console.log('Initialization compleate')
}

function alertError(message) {
  alert(message)
  localStorage.removeItem('accessToken')
  localStorage.removeItem('refreshToken')
  window.location.replace('login.html')
}

async function initUser() {
  if (!accessData) {
    setAccessData()
  }

  const id = accessData.sub

  const response = await fetch(`http://${host}/api/v1/users/${id}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })

  if (response.status !== 200) {
    alertError('Error: can\'t load user')
    return
  }

  user = await response.json()
}

async function initConversations() {
  const response = await fetch(`http://${host}/api/v1/conversations`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })

  if (response.status !== 200) {
    alertError('Error: can\'t load conversations')
    return
  }

  conversations = await response.json()
}

async function loadMessages() {
  for (let c of conversations) {
    const response = await fetch(`http://${host}/api/v1/messages/${c.id}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    })
    if (response.status !== 200) {
      alertError('Error: can\'t load messages')
      return
    }

    c.messages = await response.json()
  }

  console.log(conversations)
}

async function startClient() {
  await init()

  client = new Client({
      brokerURL: `ws://${host}/ws`,
      connectHeaders: {
        'Authorization': `Bearer ${accessToken}`
      },
      debug: function (str) {
        console.log(str);
      },
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
    })
    
    // Fallback code
  if (typeof WebSocket !== 'function') {
    // For SockJS you need to set a factory that creates a new SockJS instance
    // to be used for each (re)connect
    client.webSocketFactory = function () {
      // Note that the URL is different from the WebSocket URL
      return new SockJS(`http://${host}/stomp`)
    };
  }

  client.onConnect = function (frame) {
    client.subscribe('/user/queue/conversation', async (message) => {
      console.log(`conversation: ${message.body}`)

      const data = JSON.parse(message.body)
      data.messages = []
      conversations.push(data)
      const conversationsElement = document.getElementById('conversations')
      conversationsElement.appendChild(await Conversation(data))
    })

    client.subscribe('/user/queue/chat', async (message) => {
      console.log(`chat: ${message.body}`)
      const data = JSON.parse(message.body)
      const messagesElement = document.getElementById('messages')
      const conversationsElement = document.getElementById('conversations')

      for (let c of conversations) {
        if (c.id === data.conversation_id) {
          c.messages.push(data)
        }
      }

      if (data.conversation_id == currentConversation.id) {
        messagesElement.appendChild(Message(data))
      }

      conversationsElement.innerHTML = ''
      for (let c of conversations) {
        conversationsElement.appendChild(await Conversation(c))
      }
    })

    client.subscribe('/user/queue/error', (message) => {
      console.log(`error: ${message.body}`)
    })

    // client.publish({
    //   destination: '/app/conversation',
    //   body: JSON.stringify({
    //     'first_user_id': 'f8999bde-410e-40f9-9ed1-3606b9b62648',
    //     'second_user_id': 'a4332e21-3dd3-4cfc-83ef-be1786435a4f'
    //   })
    // })

    // client.publish({
    //   destination: '/app/chat',
    //   body: JSON.stringify({
    //     'user_id': user.id,
    //     'content': 'test message',
    //     'conversation_id': 'd732463b-3d93-487a-8732-9113581d756e'
    //   })
    // })
  }

  client.onStompError = function (frame) {
    // Will be invoked in case of error encountered at Broker
    // Bad login/passcode typically will cause an error
    // Complaint brokers will set `message` header with a brief message. Body may contain details.
    // Compliant brokers will terminate the connection after any error
    console.log('Broker reported error: ' + frame.headers['message'])
    console.log('Additional details: ' + frame.body)
  }

  client.onWebSocketClose = function (frame) {
    console.log(frame)
  }

  client.activate()
}

async function getUser(id) {
  const response = await fetch(`http://${host}/api/v1/users/${id}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  })

  if (response.status !== 200) {
    alertError('Error: can\'t load user')
    return
  }

  return await response.json()
}

async function initUI() {
  const conversationsElement = document.getElementById('conversations')
  const messagesElement = document.getElementById('messages')
  for (let c of conversations) {
    conversationsElement.appendChild(await Conversation(c))
  }

  if (currentConversation) {
    document.getElementById('header-conversation').innerHTML = anotherUser.name
  }

  if (currentConversation) {
    for (let m of currentConversation.messages) {
      messagesElement.appendChild(Message(m))
    }
  }
}

function clearUI() {
  const conversationsElement = document.getElementById('conversations')
  const messagesElement = document.getElementById('messages')

  conversationsElement.innerHTML = ''
  messagesElement.innerHTML = ''
}

async function Conversation(model) {
  const anotherId = model.first_user_id === user.id ? model.second_user_id : model.first_user_id
  const usr = await getUser(anotherId)

  const root = document.createElement('div')
  root.classList.add('conversation')

  const h2 = document.createElement('h2')
  h2.classList.add('conversation-title')
  h2.appendChild(document.createTextNode(usr.name))
  root.appendChild(h2)

  const p = document.createElement('p')
  p.classList.add('conversation-last-message')
  let message = 'Empty conversation'
  if (model.messages && model.messages.length > 0) {
    message = model.messages[model.messages.length - 1].content
  }
  p.appendChild(document.createTextNode(message))
  root.appendChild(p)

  root.addEventListener('click', (e) => {
    clearUI()
    currentConversation = model
    anotherUser = usr
    initUI()
  })

  return root
}

function Message(model) {
  const span = document.createElement('span')
  span.classList.add('time')
  span.innerHTML = new Date(model.timestamp).toDateString()

  const p = document.createElement('p')
  p.classList.add('message')
  p.appendChild(document.createTextNode(model.content))
  if (model.user_id !== user.id) {
    p.classList.add('me')
    p.insertBefore(span, p.firstChild)
  } else {
    p.classList.add('another')
    p.appendChild(span)
  }

  return p
}

function formCallback(e) {
  e.preventDefault()

  if (!client) {
    alertError('Connection error')
  }

  const input = document.getElementById('message-input')
  const message = input.value

  if (!message) {
    return
  }

  const body = {
    'content': message,
    'user_id': anotherUser.id,
    'conversation_id': currentConversation.id
  }

    client.publish({
      destination: '/app/chat',
      body: JSON.stringify(body)
    })
}