import {Head} from "next/document";
import Container from "../components/container";
import Footer from "../components/footer";
import Header from "../components/header";
import Intro from "../components/intro";
import Layout from "../components/layout";

export default function Newsletter() {
    return (
        <>
            <script type="text/javascript" src="https://app.mailjet.com/statics/js/iframeResizer.min.js"></script>
            <Layout>
                <Container>
                    <Header />
                    <div
                        style={{
                            display: "grid",
                            placeItems: "center",
                        }}
                    >
                        <iframe
                            className="mj-w-res-iframe"
                            frameBorder={0}
                            scrolling="no"
                            marginHeight={0}
                            marginWidth={0}
                            src="https://app.mailjet.com/widget/iframe/8hSP/NMr"
                            width="40%"
                            style={{
                                width: "40%",
                                maxWidth: "40%",
                                minWidth: "300px",
                            }}
                        ></iframe>
                    </div>
                </Container>
            </Layout>
        </>
    );
}

export const getStaticProps = async () => {
    return {
        props: {},
    };
};
