---
title: "Running Rust on Genezio. You heard me right."
excerpt: "Doing things you're not supposed to is always exciting. In this blog post I'm exploring if it's possible to run Rust code on Genezio."
coverImage: "/assets/blog/genezio-rs/cover.png"
date: "2023-12-20T00:00:00.000Z"
author:
    name: Laurentiu Ciobanu
    picture: "/assets/blog/authors/laur.png"
ogImage:
    url: "/assets/blog/genezio-rs/cover.png"
---

## What the ...?

Lately, I've been playing more and more with [Genezio](https://genez.io/), and I have to admit, it kinda' grew on me. If you have no idea what I'm talking about, go check it out, [here's the link again](https://genez.io/), I'll wait 😊.

Initially, I didn't know where to fit it in my stack as I already have a lot of experience with AWS and I am pretty comfortable with Lambda. That’s until one random day when I wanted to test something out quickly and didn’t want to fiddle around with all the setup. I remembered about Genezio and wanted to give it a try. It was a pleasant and frictionless experience: from my TypeScript code to the cloud in less than 3 minutes (including creating an account, installing the CLI, and logging in with the CLI). After this experience, I used it 3/4 more times and the frequency is growing, and the experience is still very good. I only encountered one bug and at this point, I was so happy with the product I decided to fix it myself and [contribute back the change](https://github.com/Genez-io/genezio/pull/617).

But, as you might guess, I wouldn't be writing a post just to tell you that. I have a problem with Genezio, and that problem is: from my **TypeScript** code to the cloud in less than 3 minutes. Got it? It’s TypeScript. **The problem is** **TypeScript**.

Let me make it clear, I would pick TypeScript over JavaScript any time (I can't go without types for even 2 seconds), and it's my second most preferred language. However, it's still JavaScript, and I've reached my limit with this godly awful language and all its runtimes.

At the moment Genezio only supports JavaScript/TypeScript, Dart (weird flex, but ok), and Kotlin (coming soon, I think). Despite having experience with three out of the four languages on this list, I must admit that I am not particularly fond of any of them.

Now **Rust**, that’s a real language, for real men! (I understand if you find this statement offensive, you must understand it’s intentional; it’s called **humor**).
