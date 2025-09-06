# travesty-userapi-test
This library lets you turn your account into a robot/user bot

[POST] https://api.travesty.chat/api/account/login -> Body, raw, JSON.
FORMAT:
```json
{
"email": "",
"password": ""
}
```

It sets a cookie and you need to send that to the websocket 
