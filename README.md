# travesty-userapi
This library lets you turn your account into a robot/user bot

# Documentation
> [!NOTE]
> Library hasn't been testing using the commonjs format of require

## Logging in
```js
import { TravestyClient } from 'travesty-userapi';

const client = new TravestyClient(); // The TravestyClient supports some additional arguments that we will touch on later

await client.login(`${process.env.USER_EMAIL}`, `${process.env.USER_PASSWORD}`); // You do not have to use env but I recommend it. NodeJS supports ENV natively if you pass the --env-file=.env flag
```

Congragulations for logging into your account. You are now connected and should be reciving events.

## Events
```js
client.on('messageCreate') // triggers when a message is created in a server. You can see how it's used below.

client.on('messageCreate', (msg) => {
    console.log('A new message that contains:', msg.text) // you can also do msg.channelId and it'll give you the channelid of the message.
})

// Example with the ability to send messages
client.on('messageCreate', (msg) => {
    if (msg.text === 'help') {
        client.sendMessage(msg.channelId, 'This is a message');
    }
})
```
We will expand upon this as we add more things. Thanks for using travesty-userapi!

# Contributing
You are welcome to contribute to this mini project. I will have you know that I will no longer support the userapi after travesty goes into beta (assuming there's bot support) if travesty does not people logging into their user accounts to automate things. This is simply a workaround until we get the ability to create bots.
You may not publish this project as your own and you may not use it with malicious intent or with the goal of overwheling travesty as a platform. If this becomes the case I will easily STOP all development efforts and bring down the project.

# Support
This project is brought to you by Mega Utilities' Mega API | Join us on: [Discord](https://discord.gg/J9N6evPF8Y), [Guilded](https://www.guilded.gg/i/kdvY8BqE), [Revolt Chat](https://rvlt.gg/d921cr9H), [Travesty Chat](https://alpha.travesty.chat/zjsAbkd2), [Reddit](https://www.reddit.com/r/MegaUtilities/s/uOc1vPlqlX), [GitHub Discussions](https://github.com/orgs/mega-api/discussions), [Open an Issue](https://github.com/mega-api/travesty-userapi/issues)
