/* ── Single source of truth for all portfolio content ──────── */

/* ── Sidebar / Nav ──────────────────────────────────────── */
export const navLinks = [
  { label: 'Home',         href: '/',            icon: 'home' },
  { label: 'About',        href: '/about',       icon: 'person' },
  { label: 'Achievements', href: '/achievements', icon: 'trophy' },
  { label: 'Projects',     href: '/projects',    icon: 'code' },
  { label: 'Experience',   href: '/experience',  icon: 'work_history' },
  { label: 'Uses',         href: '/uses',        icon: 'settings' },
  { label: 'Contact',      href: '/contact',     icon: 'mail' },
  { label: 'Links',        href: '/links',       icon: 'link' },
];

/* ── Hero / Home ─────────────────────────────────────────── */
export const hero = {
  firstName: 'Karl',
  middleName: 'Wystan',
  lastName: 'Cabalonga',
  title: 'Aspiring Web Developer',
  location: 'Iloilo City, Philippines',
  email: 'karlcabalonga@gmail.com',
  socials: [
    { name: 'GitHub', url: 'https://github.com/KWystan' },
    { name: 'Facebook', url: 'https://www.facebook.com/stanwy.2024/' },
    { name: 'Instagram', url: '#' },
  ],
  headline: 'Building clean, modern web experiences',
  intro: [
    "I'm a passionate web developer from the Philippines, focused on crafting responsive, human-centered interfaces with modern tooling.",
    'Every line of code is an opportunity to solve real problems. I combine frontend craftsmanship with backend fundamentals to build things that work — and look good doing it.',
  ],
};

/* ── About ───────────────────────────────────────────────── */
export const aboutIntro = [
  'An aspiring Web Developer from the Philippines, focused on building modern and responsive web applications.',
  'Experienced in frontend and backend development, UI design, and networking.',
  'Committed to continuous learning and applying web technologies to solve real-world problems.',
];

export const aboutDetailed = {
  paragraphs: [
    "I'm Karl Wystan Cabalonga, a third-year BSIT student at West Visayas State University — College of Information and Communications Technology. My journey in technology started with curiosity about how websites and networks actually work, which quickly grew into a full-fledged passion for web development.",
    "What drives me is the craft of building — turning a blank canvas into something functional, beautiful, and meaningful. I believe great interfaces aren't just visually appealing; they're invisible, letting users focus on what matters without fighting the tool.",
    "Outside of code, I'm a lifelong learner. Whether it's a new framework, a networking concept, or a design principle, I enjoy digging deep and understanding how things work from the ground up. I'm currently expanding my skills in full-stack development and exploring cloud infrastructure.",
    "When I'm not at my keyboard, you'll find me reading manga, exploring new music, or thinking about my next project. I'm always open to collaboration, freelance work, or just a good conversation about tech.",
  ],
  highlights: [
    { label: 'Based in', value: 'Iloilo City, Philippines' },
    { label: 'Studying', value: 'BSIT @ WVSU-CICT' },
    { label: 'Focus', value: 'Web Development, UI Design, Networking' },
    { label: 'Languages', value: 'English, Filipino, Hiligaynon' },
  ],
};

/* ── Stack ───────────────────────────────────────────────── */
export const stack = {
  Development: ['JavaScript', 'Python', 'HTML', 'CSS', 'React', 'Node.js', 'Express.js', 'Tailwind CSS', 'MongoDB', 'MySQL', 'Firestore', 'XAMPP', 'Vercel', 'Hugging Face', 'Namecheap'],
  'Tools & Design': ['Git', 'Docker', 'Figma', 'GitHub', 'Canva', 'Insomnia'],
  'Networking & Systems': ['Cisco', 'Packet Tracer'],
};

/* ── Experience ──────────────────────────────────────────── */
export const experience = [
  {
    company: 'West Visayas State University',
    initials: 'WV',
    role: 'BSIT Student',
    type: 'Student',
    startDate: 'Aug 2023',
    endDate: 'Present',
    duration: '3 yrs',
    description: 'Pursuing a Bachelor of Science in Information Technology at the College of Information and Communications Technology. Building a strong foundation in software development, networking, and systems design.',
    techs: ['Web Design', 'Networking', 'Application Development', 'System Servicing'],
  },
];

/* ── Education ───────────────────────────────────────────── */
export const education = {
  school: 'West Visayas State University — CICT',
  degree: 'Bachelor of Science in Information Technology',
  period: '2023 — 2027',
  location: 'Luna Street, La Paz, Iloilo, Philippines',
  details: [
    'College of Information and Communications Technology',
    'Focus on web development, networking, and practical computing solutions',
  ],
};

/* ── Projects ────────────────────────────────────────────── */
export const projectCategories = [
  { id: 'all', label: 'All' },
  { id: 'personal', label: 'Personal' },
  { id: 'school', label: 'School' },
  { id: 'freelance', label: 'Freelance' },
  { id: 'other', label: 'More' },
];

export const projects = [
  {
    title: 'Manglo.me',
    period: '2026',
    category: 'personal',
    description: 'A free manga, manhwa, and manhua reading platform built mobile-first with a focus on fast loading and seamless reading experience across all devices. Deployed on Vercel with a custom .me domain.',
    techs: ['React', 'Tailwind CSS', 'Vite', 'Node.js', 'Express.js', 'Firebase'],
    result: 'live manga platform',
    link: 'https://www.manglo.me',
  },
  {
    title: 'Network Configuration Lab',
    period: '2025',
    category: 'school',
    description: 'Configured and simulated network topologies using Cisco Packet Tracer, implementing VLANs, routing protocols, and subnetting.',
    techs: ['Cisco', 'Packet Tracer', 'VLAN', 'Routing'],
    result: 'practical networking skills',
    link: '#',
  },
  {
    title: 'Web Application Project',
    period: '2025',
    category: 'school',
    description: 'Developed a full-stack web application as part of academic coursework, featuring user authentication and database integration.',
    techs: ['Node.js', 'Express.js', 'MongoDB', 'JavaScript'],
    result: 'functional full-stack app',
    link: '#',
  },
  {
    title: 'System Servicing Workshop',
    period: '2024',
    category: 'school',
    description: 'Hands-on experience in computer system assembly, troubleshooting, and maintenance as part of IT coursework.',
    techs: ['Hardware', 'Troubleshooting', 'OS Installation'],
    result: 'hands-on servicing skills',
    link: '#',
  },
];

/* ── Achievements ────────────────────────────────────────── */
export const certifications = [
  {
    title: 'Introduction to Cybersecurity',
    issuer: 'Cisco Networking Academy',
    initials: 'CS',
    date: '14 Apr 2026',
    link: 'https://www.credly.com/badges/f552074d-e5d0-4b21-8743-106caca5641f',
    linkLabel: 'View on Credly',
  },
  {
    title: 'CCNA: Switching, Routing, and Wireless Essentials',
    issuer: 'Cisco Networking Academy',
    initials: 'SR',
    date: '14 Jan 2026',
    link: 'https://www.credly.com/badges/9c61b72a-58c9-48b1-b994-118b01037d7b',
    linkLabel: 'View on Credly',
  },
  {
    title: 'AI.DEAS For Impact: AI for Developing Ethical and Applicable Solutions',
    issuer: 'DICT — ICT Industry Development Bureau',
    initials: 'AI',
    date: 'Sep 2025',
    link: null,
    linkLabel: null,
  },
  {
    title: 'CCNA: Introduction to Networks',
    issuer: 'Cisco Networking Academy',
    initials: 'CN',
    date: '20 May 2025',
    link: 'https://www.credly.com/badges/5de3e5b9-c232-483d-bb7b-d141e7f56664',
    linkLabel: 'View on Credly',
  },
];

export const awards = [
  {
    title: 'AI.DEAS Top 10 Finalist',
    event: 'DICT — ICT Industry Development Bureau',
    date: 'Sep 2025',
    description: 'Selected as a Top 10 finalist for the AI.DEAS For Impact program, presenting AI-driven solutions for ethical and applicable development.',
    icon: 'emoji_events',
  },
];

/* ── Uses ────────────────────────────────────────────────── */
export const uses = {
  Hardware: [
    { name: 'Laptop', detail: 'Main development machine' },
    { name: 'Monitor', detail: 'External display for coding' },
    { name: 'Keyboard', detail: 'Mechanical keyboard for comfort' },
    { name: 'Mouse', detail: 'Wireless ergonomic mouse' },
  ],
  Software: [
    { name: 'VS Code', detail: 'Primary code editor with custom extensions' },
    { name: 'Figma', detail: 'UI/UX design and prototyping' },
    { name: 'Insomnia', detail: 'API testing and debugging' },
    { name: 'Git', detail: 'Version control and collaboration' },
    { name: 'Docker', detail: 'Containerization for consistent environments' },
  ],
  Browser: [
    { name: 'Chrome DevTools', detail: 'Debugging and performance profiling' },
    { name: 'React DevTools', detail: 'Component inspection and profiling' },
  ],
  Productivity: [
    { name: 'Notion', detail: 'Notes, tasks, and project planning' },
    { name: 'Figma', detail: 'Design collaboration' },
    { name: 'Canva', detail: 'Quick graphics and social media assets' },
  ],
};

/* ── Contact ─────────────────────────────────────────────── */
export const contact = {
  headline: "Let's work together",
  availability: "I'm always open to new opportunities, collaborations, and connecting with fellow developers.",
  email: 'karlcabalonga@gmail.com',
  responseTime: 'Usually responds within 24 hours',
  subjects: ['Freelance Project', 'Collaboration', 'Job Opportunity', 'Just Saying Hi'],
};

/* ── Links Page ──────────────────────────────────────────── */
export const links = [
  { name: 'GitHub', url: 'https://github.com/KWystan', icon: 'github', description: 'Code, repos, and open source' },
  { name: 'Facebook', url: 'https://www.facebook.com/stanwy.2024/', icon: 'facebook', description: "Let's connect on social media" },
  { name: 'Instagram', url: '#', icon: 'instagram', description: 'Visual snippets and stories' },
  { name: 'Email', url: 'mailto:karlcabalonga@gmail.com', icon: 'mail', description: 'Send me a message directly' },
  { name: 'Manglo.me', url: 'https://www.manglo.me', icon: 'open_in_new', description: 'My latest project' },
];

/* ── CTA ─────────────────────────────────────────────────── */
export const cta = {
  headline: "Let's work together",
  availability: "I'm always open to new opportunities, collaborations, and connecting with fellow developers.",
  email: 'karlcabalonga@gmail.com',
};

/* ── Footer ──────────────────────────────────────────────── */
export const footer = {
  initials: 'KC',
};
