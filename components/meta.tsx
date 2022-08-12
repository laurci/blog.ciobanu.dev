import Head from "next/head";

const Meta = () => {
    return (
        <Head>
            <link rel="apple-touch-icon" sizes="180x180" href="/favicon/apple-touch-icon.png" />
            <link rel="icon" type="image/png" sizes="32x32" href="/favicon/favicon-32x32.png" />
            <link rel="icon" type="image/png" sizes="16x16" href="/favicon/favicon-16x16.png" />
            <link rel="og:image" type="image/png" href="/favicon/android-chrome-512x512.png" />
            <link rel="manifest" href="/favicon/site.webmanifest" />
            <link rel="shortcut icon" href="/favicon/favicon.ico" />
            <meta name="msapplication-TileColor" content="#000000" />
            <meta name="theme-color" content="#000" />
            <link rel="alternate" type="application/rss+xml" href="/feed.xml" />
            <meta name="description" content="I love writing code and talking about it." />
        </Head>
    );
};

export default Meta;
