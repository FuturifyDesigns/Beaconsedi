import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, HeartPulse, MapPin, Users, ShieldCheck, Ambulance, MessageSquare } from "lucide-react";
import rescueImage from "@/assets/medical-rescue-hero.webp";
import { StarOfLife } from "@/components/StarOfLife";

export const Route = createFileRoute("/")({
  head: () => ({meta: [{title: "Beacon Sedi | Connected ambulance assistance"}, {name: "description", content: "Create a Beacon Sedi account to request ambulance assistance, share your location and stay connected with your response team."}]}),
  component: Home,
});
function Signup() { return <Link to="/auth" search={{mode:"signup"}} className="home-button">Create account <ArrowRight size={18}/></Link>; }
function Home() {
 const features = [
  [MapPin,"Live location sharing","Share your current location during an incident to help your assigned team find you."],
  [HeartPulse,"Your medical profile","Keep important medical details in your account so authorised teams can understand your needs."],
  [Ambulance,"Response updates","Follow the progress of your assigned ambulance and incident from your account."],
  [MessageSquare,"Stay in touch","Exchange incident messages and voice notes with the response team."],
  [Users,"Your care circle","Manage trusted contacts who can support you when you need assistance."],
  [ShieldCheck,"Account access","Access assistance and manage your personal information through your signed-in account."],
 ] as const;
 return <div className="beacon-home">
  <header className="home-header home-container"><Link to="/" className="home-brand"><StarOfLife/><span>BEACON SEDI<small>Medical response, connected</small></span></Link><nav aria-label="Main navigation"><Link to="/auth">Sign in</Link><span className="home-nav-signup"><Signup/></span></nav></header>
  <main>
   <section className="home-hero home-container"><div><p className="home-eyebrow">AMBULANCE ASSISTANCE · BOTSWANA</p><h1>Medical response,<br/><em>connected around you.</em></h1><p className="home-lead">A clearer connection between you and the people coming to help. Share your location, keep important medical details together and follow your ambulance response from one account.</p><div className="home-actions"><Signup/><Link to="/auth" className="home-signin">Already registered? Sign in <ArrowRight size={16}/></Link></div><p className="home-account-note"><ShieldCheck size={17}/> Create an account and sign in to use the service.</p></div><figure className="home-hero-photo"><img src={rescueImage} alt="Illustration of paramedics assisting a seated patient beside an ambulance" width={1536} height={1024} fetchPriority="high"/><figcaption>Connected information.<br/><strong>Coordinated ambulance response.</strong></figcaption></figure></section>
   <section className="home-steps"><div className="home-container"><p className="home-eyebrow">HOW IT WORKS</p><h2>Be ready before you need assistance.</h2><div className="home-three">{[["01","Create your account","Register your details and sign in to access Beacon Sedi."],["02","Prepare your profile","Add medical information and trusted contacts. Keep your details up to date."],["03","Connect when you need help","From your account, request assistance, share your location and follow response updates."]].map(([n,t,d])=><article key={n}><span className="home-step-number">{n}</span><h3>{t}</h3><p>{d}</p></article>)}</div></div></section>
   <section className="home-section home-container"><p className="home-eyebrow">ONE CONNECTED SERVICE</p><h2>The information that matters,<br/>in the right place.</h2><div className="home-feature-grid">{features.map(([Icon,t,d])=><article key={t}><Icon size={25}/><h3>{t}</h3><p>{d}</p></article>)}</div></section>
   <section className="home-preparation home-container"><div><p className="home-eyebrow">GET SET UP</p><h2>A little preparation.<br/>A clearer response.</h2><p>Complete your profile when you register. During an incident, keep your device connected and allow location access so your response team receives the latest available position.</p></div><ul><li>Use an email address you can access.</li><li>Add a current contact number.</li><li>Review allergies and relevant medical details.</li><li>Keep trusted contact information up to date.</li><li>Allow location access when requesting assistance.</li></ul></section>
   <section className="home-section home-container home-faq"><p className="home-eyebrow">GOOD TO KNOW</p><h2>Before you get started.</h2><details><summary>Do I need an account?</summary><p>Yes. Create an account and sign in to request assistance and access the service.</p></details><details><summary>Why does Beacon Sedi need my location?</summary><p>Your location helps your assigned response team find you. Accuracy depends on your device, permissions, signal and connection. Review the location shown and provide useful landmarks when possible.</p></details><details><summary>Can I update my information?</summary><p>Yes. Sign in to manage your medical profile and care circle. Review your information regularly so it stays current.</p></details></section>
   <section className="home-join home-container"><StarOfLife/><div><h2>Your next step: get connected.</h2><p>Create your account and prepare your profile today.</p></div><Signup/></section>
  </main><footer className="home-footer home-container"><span>BEACON SEDI · Medical response, connected</span><div><Link to="/auth">Sign in</Link><Link to="/auth" search={{mode:"signup"}}>Create account</Link></div></footer>
 </div>;
}
