import { useNavigate } from "react-router-dom";
import Footer from "@/layouts/footer/footer";
import LandingHeader from "../components/landingHeader";
import HeroSection from "../components/heroSection";
import FeatureGrid from "../components/featureGrid";
import { SecondaryButton } from "../components/ctaButtons.styles";
import {
  PageContainer,
  SecondaryCtaSection,
  SecondaryCtaText,
} from "./landingPage.styles";

const LandingPage = () => {
  const navigate = useNavigate();

  const goToLogin = () => navigate("/login");
  const goToGuest = () => navigate("/guest");

  return (
    <PageContainer>
      <LandingHeader />
      <HeroSection onPrimaryClick={goToLogin} onSecondaryClick={goToGuest} />
      <FeatureGrid />
      <SecondaryCtaSection>
        <SecondaryCtaText>지금 바로 로그인 없이 둘러보세요</SecondaryCtaText>
        <SecondaryButton type="button" onClick={goToGuest}>
          체험하기 →
        </SecondaryButton>
      </SecondaryCtaSection>
      <Footer />
    </PageContainer>
  );
};

export default LandingPage;
