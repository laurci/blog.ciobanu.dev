---
title: "If it ain't broke... break it."
excerpt: "Doing things you're not supposed to is always exciting. In this blog post I'm exploring if it's possible to write a Terraform Provider for Ubicloud in Rust."
coverImage: "/assets/blog/terraform-rs/cover.png"
date: "2024-02-27T00:00:00.000Z"
author:
    name: Laurentiu Ciobanu
    picture: "/assets/blog/authors/laur.png"
ogImage:
    url: "/assets/blog/terraform-rs/cover.png"
---

## Why am I “oxidizing” Terraform?

I always had a love-hate relationship with [Terraform](https://www.terraform.io/). I used it a lot in the past and I have some opinions (of course I do), but this blog is not about that.

This blog is about some **internals** of Terraform, more specifically about **Terraform Providers**.

**So, what are providers?**

Let’s say you want to automate the creation of an AWS S3 bucket. You create a `bucket.tf` file, open it in your editor and create your `aws_s3_bucket` resource. You then run `terraform apply`, check the generated plan, and confirm it. If everything works, you will see your shiny brand-new S3 bucked in your AWS console.

How did this happen? How does Terraform know to create resources in AWS? The answer is simple: **it doesn’t know**, but the AWS Provider does. Terraform just parses the configuration and keeps the state of your stack, then it uses providers for each resource to compute the differences and apply them. Simply put, providers are responsible for translating state changes into the proper API calls that configure the infrastructure to reflect the updates.

I know what you’re thinking: “That’s cool, but I already knew that and I also expected something a bit more technical”. I agree. We need to go deeper.

**So, what are providers?**

I think the closest analogue we can me is **plugins.** Providers are **highly specialized plugins** for Terraform. The CLI parses the configuration files and then it finds, loads, and configures the providers used. Those can then be used to plan and apply infrastructure changes.

You can even write your own providers in Go with the Provider/Plugin framework for Terraform. [This blog](https://www.hashicorp.com/blog/writing-custom-terraform-providers) from Hashicorp goes through the process. You define the schemas for your resources and handlers for creating, updating, and deleting them. I tried writing one following the guide and it went pretty smoothly. It was quite an enjoyable and simple process.

_“Case closed. That’s it. I can move on with my life.”_ I thought as I prepared to go home for the day. Little did I know back then, but the ADHD in my brain had other plans.

Not even a few hours later, at home, sitting on the couch, enjoying a good episode of **_Better Call Saul_**, a question popped into my head.

**_Me:_ So, what are providers?**\
**_Also me:_** What do you mean? We already talked about this. Providers are plugins for Terraform that manage resou…\
**_Me:_** No. That’s what they do. What **are** providers?\
**_Also me_**: You’re terrible.

He’s awful, but he is also right. What are providers? Terraform is written in Go, and providers are also written in Go, so are they dynamic libraries? No. That can’t be. They have a main function. They have to be standalone processes. If that’s the case, how does it get data to/from Terraform? Are they sharing memory, using a socket, or talking via stdin/out? Is this even safe?

So many questions, so few answ… Oh, Hashicorp wrote about this in their docs. [How Terraform works with plugins](https://developer.hashicorp.com/terraform/plugin/how-terraform-works). Seems reasonable, let’s see.
