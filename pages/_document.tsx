import Document, {Html, Head, Main, NextScript} from "next/document";

export default class MyDocument extends Document {
    render() {
        return (
            <Html lang="en">
                <script defer src={`https://www.googletagmanager.com/gtag/js?id=G-SSN7HLRX7J`} />

                <script
                    defer
                    dangerouslySetInnerHTML={{
                        __html: `
                                    window.dataLayer = window.dataLayer || [];
                                    function gtag(){window.dataLayer.push(arguments);}
                                    gtag('js', new Date());
                                    gtag('config', 'G-SSN7HLRX7J', {
                                        page_path: window.location.pathname,
                                    });
                `,
                    }}
                ></script>

                <Head />
                <body>
                    <Main />
                    <NextScript />
                </body>
            </Html>
        );
    }
}
