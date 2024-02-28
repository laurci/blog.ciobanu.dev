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

I think the closest analog we can make is **plugins.** Providers are **highly specialized plugins** for Terraform. The CLI parses the configuration files and then it finds, loads, and configures the providers used. Those can then be used to plan and apply infrastructure changes.

You can even write your own providers in Go with the Provider/Plugin framework for Terraform. [This blog](https://www.hashicorp.com/blog/writing-custom-terraform-providers) from Hashicorp goes through the process. You define the schemas for your resources and handlers for creating, updating, and deleting them. I tried writing one following the guide and it went pretty smoothly. It was quite an enjoyable and simple process.

_“Case closed. That’s it. I can move on with my life.”_ I thought as I prepared to go home for the day. Little did I know back then, but the ADHD in my brain had other plans.

Not even a few hours later, at home, sitting on the couch, enjoying a good episode of **_Better Call Saul_**, a question popped into my head.

**_Me:_ So, what are providers?**\
**_Also me:_** What do you mean? We already talked about this. Providers are plugins for Terraform that manage resou…\
**_Me:_** No. That’s what they do. What **are** providers?\
**_Also me_**: You’re terrible.

He’s awful, but he is also right. What are providers? Terraform is written in Go, and providers are also written in Go, so are they dynamic libraries? No. That can’t be. They have a main function. They have to be standalone processes. If that’s the case, how does it get data to/from Terraform? Are they sharing memory, using a socket, or talking via stdin/out? Is this even safe?

So many questions, so few answ… Oh, Hashicorp wrote about this in their docs. [How Terraform works with plugins](https://developer.hashicorp.com/terraform/plugin/how-terraform-works). Seems reasonable, let’s see.

![cat reading gif](https://media1.giphy.com/media/NFA61GS9qKZ68/giphy.gif?cid=7941fdc6zt2os3o16a8kkop7qhcp8mmf56yr5oeloh9ipmik&ep=v1_gifs_search&rid=giphy.gif&ct=g)

Got it! They are standalone processes! And, even more, they are **tiny gRPC servers**! From what I understand, Terraform recommends Go and using their framework, but they don’t enforce it. The protocol is [documented here](https://developer.hashicorp.com/terraform/plugin/terraform-plugin-protocol), and it looks to me like it could be implemented in any language. You know what this means lads and gals, I’m making a Terraform Provider in Rust.

## Ubicloud

If I’m making a provider, I need an infrastructure tool/service to automate. My choice here is [ubicloud](https://www.ubicloud.com/)'s hosted offering. They offer very affordable compute, but are still an early-stage startup and don’t have many managed services. Perfect for automation.

By the end of this journey, I want to run a single command and have a fully working multi-node Kubernetes Cluster on top of Ubicloud VMs.

_Hello! Future me here. Let me break the fourth wall a bit, and just for full transparency, acknowledge that Ubicloud did reach out to me, but they are not sponsoring this blog. They did, however, credit my account for the amount I spent on their cloud, and they helped out a lot with their API. Many thanks to the team behind Ubicloud! You guys have an awesome product. Now, back to the blog!_

## Bootstrapping and handshake

As I said above, our provider will have to spin up a gRPC server, and we’ll get to the implementation of that soon, I promise, but before that, we have to tell Terraform how to connect to this server.

I have found [this very up-to-date guide](https://github.com/hashicorp/go-plugin/blob/main/docs/guide-plugin-write-non-go.md) from 7 years ago (lucky me). It gave me some insight into how to do this step, but it was so outdated, that I had to look at the code myself. So, here’s how it works:

-   When Terraform starts up our process it gives us a few basic details in the form of environment variables. This includes a range for the port we should use, but also a client certificate for mTLS.
-   Then it waits for a message from our `stdout` in the following format: `CORE-PROTOCOL-VERSION | APP-PROTOCOL-VERSION | NETWORK-TYPE | NETWORK-ADDR | PROTOCOL | SERVER-CERT`. This message will look something like this: `1|1|tcp|127.0.0.1:1234|grpc|{base64-encoded-pem}`.
-   After it parses the message, it attempts to connect to the server with the details provided.
-   Everything else happens over gRPC.

Looks simple enough. First, we have to generate a server certificate to use for mTLS, then we need to spin up a gRPC server and listen on a port in the range provided by Terraform (I just hard-coded it), use the generated server certificate, and also trust the client certificate received from Terraform. When this is ready, we can print the properly formatted message on `stdout`.

You can find some of the code for these steps [here](https://github.com/laurci/terraform-rust-provider/blob/459490ab4dd523457d58c54efb6e6179c7d931bc/src/main.rs#L39), but mostly [here](https://github.com/laurci/terraform-rust-provider/blob/main/src/tls.rs). I used [tonic](https://crates.io/crates/tonic) for the server and [rustls](https://crates.io/crates/rustls) for the TLS stuff (it got much easier to do this sort of stuff in Rust than it used to be; kids these days won’t know the struggle).

We can now proceed to the implementation of the gRPC server. After a bit of digging, I’ve found [the proto file](https://github.com/laurci/terraform-rust-provider/blob/main/schemas/tfplugin6.0.proto) for the `tfplugin` protocol v6. Other services do exist, but this is the only one required to make this work. I used the proto file combined with information from the [protocol documentation](https://developer.hashicorp.com/terraform/plugin/terraform-plugin-protocol) to implement everything.

## The schema

Terraform parses and validates configuration before it even thinks about planning or applying changes to the state. To do this it needs a schema for each provider to validate against. This feature is also used in the LSP to provide IntelliSense and other smart editor features while editing configuration.

Given that Terraform doesn’t know anything about resources, only the providers do, I expected an RPC call to get the schema from us. And, sure enough, the first thing we need to implement is the `GetProviderSchema` RPC.

You can check the implementation of this [here](https://github.com/laurci/terraform-rust-provider/blob/459490ab4dd523457d58c54efb6e6179c7d931bc/src/server.rs#L64). It’s pretty simple. You need to provide a provider schema that specifies the data used to configure the provider (credentials, default region, and other stuff like that), resource, and datasource schemas (for each resource/datasource handled by the provider) but also some provider metadata.

This response can also return some diagnostics (I’m not sure what diagnostics you could give from the `GetProviderSchema` RPC, as I don’t see how this could fail, but whatever). Actually, all responses can return diagnostics, which I find pretty neat.

Each schema has some basic information (like the name, description, versioning, and deprecation info), but also a list of fields. Each field has, again, basic information (name, description, etc.), and also validation information (the type of the field, if it’s optional, sensitive, computed, etc.). You could also define nested block types, for more complex inputs/outputs, but I didn’t get into that yet.

Now, Terraform will go ahead and validate the configuration using the schema. It will also get your opinion with the `ValidateProviderConfig`, `ValidateResourceConfig`, and `ValidateDataResourceConfig` RPCs.

## Configuration

The provider is started, the schema is validated, and now, we can get to work. Or can we? We have one more step before we can get to creating VMs. We need to get our provider configuration from Terraform. For our use case, this includes the Ubibloud username, password, and project ID.

Luckily for us, we don’t have to do anything. Terraform will call the `ConfigureProvider` RPC with the configuration data.

## The format rant

In what format do you think Terraform will ship this data to us? JSON? XML? Any reasonable text format? Any reasonable standard binary format?

Good guesses, but the answer is [cty](https://github.com/zclconf/go-cty). If you're thinking **_What? What is cty?_**, I felt the same way. `cty` is a format based on [msgpack](https://msgpack.org/) but with some gotchas: they add type information in the message (only sometimes), they have a special representation for empty values (painful) and the only implementation I found was in Go (lucky me).

My other question is: **why Terraform, why?** They already use JSON in some other places in the RPC, they’re not even consistent with their format! On top of the fact that they already use gRPC, if they wanted an efficient binary format, why can’t they just use `protobuf` for this? It’s already there! Or even just `msgpack`. Why do they use this magic on top?

Anyway, I found this great crate [rmp](https://crates.io/crates/rmp) for parsing `msgpack` (it even works with `serde`) and I managed to hack in empty values (but only for strings, and it’s very hacky).

## Actually doing some work

We are now ready to do some API calls. I quickly threw together a Ubicloud API client (it’s a very small API at the moment) to manage VMs. You can find it here but I would highly discourage you from using it, as their API is not stable yet (and no docs published).

## TODO

![final result](/assets/blog/terraform-rs/working-page.jpeg)
