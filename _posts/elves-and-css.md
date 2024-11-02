---
title: "An elf and a spider walked into a bar."
excerpt: "F*ck nextjs. Let's hand-write a website in x86 machine code to prove a point."
coverImage: "/assets/blog/elves-and-css/cover.png"
date: "2024-11-02T00:00:00.000Z"
author:
    name: Laurentiu Ciobanu
    picture: "/assets/blog/authors/laur.png"
ogImage:
    url: "/assets/blog/elves-and-css/cover.png"
---

**WARNING**: this entire blog post is a rant.

So, [Next.js Conf](https://nextjs.org/conf) 2024 just happened, and I'm so mad. What the f\*ck happened to the web? What have we done? How much complexity can we f\*cking stack on top of this shit platform, and why do we have to solve everything with Javascript (this is a different rant)? 

Is this component rendered on the server or is it on the client? Or both? Should I `'use server'` or `'use client'`? Or neither? What's the default behaviour of `fetch` again? Does it cache?

And now we have `'use cache'`?

![everything is fine](https://media0.giphy.com/media/v1.Y2lkPTc5MGI3NjExOXhldzJrbmI1ZWhibGVsZ3Nqdmt2NXk2bmRxY2l6NnpmNDJuZ3JiYSZlcD12MV9pbnRlcm5hbF9naWZfYnlfaWQmY3Q9Zw/NTur7XlVDUdqM/giphy.webp)

What the f\*ck would've been wrong with `import {fetchAndCache} from "next/fetch";`? Why change the way `fetch` (a global __AND__ a web standard) works by default? This is spooky magic, not in the good way. Ok, and after the backlash, we change it again, to do the exact opposite by default?

Oh, and also, there's the new `'use cache'`, but my blood is already boiling, so I'm not going into it.

I'm getting mad even by just thinking about the comments for this post __"It's very simple bro, you're too stupid to understand."__.

You want simple? I'll show you f\*cking simple. Actually, I'll give you the bare minimum.

## static websites, the web and HTTP

