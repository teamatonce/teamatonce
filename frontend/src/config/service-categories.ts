/**
 * Comprehensive Service Categories for Team@Once
 * Modeled after Fiverr/Upwork marketplace categories
 */

export interface SubCategory {
  id: string;
  name: string;
  description: string;
  icon?: string;
  popular?: boolean;
  skills?: string[];
}

export interface ServiceCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  gradient: string;
  description: string;
  subcategories: SubCategory[];
  isTech?: boolean; // Whether this category needs tech stack selection
}

export const SERVICE_CATEGORIES: ServiceCategory[] = [
  // ============================================
  // 1. GRAPHICS & DESIGN
  // ============================================
  {
    id: 'graphics-design',
    name: 'Graphics & Design',
    icon: 'Palette',
    color: 'pink',
    gradient: 'from-pink-500 to-rose-500',
    description: 'Visual design services for brands and businesses',
    subcategories: [
      { id: 'logo-design', name: 'Logo Design', description: 'Custom logo creation', popular: true, skills: ['Adobe Illustrator', 'Photoshop', 'Brand Design'] },
      { id: 'brand-identity', name: 'Brand Identity', description: 'Complete brand packages', popular: true, skills: ['Brand Strategy', 'Visual Identity', 'Style Guides'] },
      { id: 'business-cards', name: 'Business Cards & Stationery', description: 'Professional stationery design', skills: ['Print Design', 'InDesign'] },
      { id: 'illustration', name: 'Illustration', description: 'Custom illustrations and artwork', popular: true, skills: ['Digital Art', 'Procreate', 'Character Design'] },
      { id: 'ui-ux', name: 'UI/UX Design', description: 'User interface and experience design', popular: true, skills: ['Figma', 'Sketch', 'Adobe XD', 'Prototyping'] },
      { id: 'web-design', name: 'Web Design', description: 'Website mockups and designs', skills: ['Web Design', 'Responsive Design', 'Figma'] },
      { id: 'app-design', name: 'App Design', description: 'Mobile app interface design', skills: ['Mobile UI', 'iOS Design', 'Android Design'] },
      { id: 'packaging', name: 'Packaging Design', description: 'Product packaging and labels', skills: ['Packaging', '3D Mockups', 'Print Design'] },
      { id: 'infographics', name: 'Infographics', description: 'Data visualization and infographics', skills: ['Data Visualization', 'Information Design'] },
      { id: 'social-media-design', name: 'Social Media Design', description: 'Social media graphics and templates', popular: true, skills: ['Social Media', 'Canva', 'Photoshop'] },
      { id: 'presentation-design', name: 'Presentation Design', description: 'PowerPoint and pitch deck design', skills: ['PowerPoint', 'Keynote', 'Google Slides'] },
      { id: 'book-covers', name: 'Book Covers', description: 'eBook and print book covers', skills: ['Book Design', 'Typography'] },
      { id: 'album-covers', name: 'Album & Podcast Covers', description: 'Music and podcast artwork', skills: ['Album Art', 'Music Industry'] },
      { id: 'flyer-design', name: 'Flyer & Poster Design', description: 'Event flyers and posters', skills: ['Print Design', 'Event Marketing'] },
      { id: 't-shirt-design', name: 'T-Shirt & Merch Design', description: 'Apparel and merchandise design', skills: ['Merch Design', 'Print on Demand'] },
    ],
  },

  // ============================================
  // 2. DIGITAL MARKETING
  // ============================================
  {
    id: 'digital-marketing',
    name: 'Digital Marketing',
    icon: 'TrendingUp',
    color: 'orange',
    gradient: 'from-orange-500 to-amber-500',
    description: 'Marketing services to grow your business online',
    subcategories: [
      { id: 'seo', name: 'SEO Services', description: 'Search engine optimization', popular: true, skills: ['SEO', 'Google Analytics', 'Keyword Research'] },
      { id: 'social-media-marketing', name: 'Social Media Marketing', description: 'Social media strategy and management', popular: true, skills: ['Social Media', 'Content Strategy', 'Community Management'] },
      { id: 'social-media-ads', name: 'Social Media Advertising', description: 'Paid social campaigns', skills: ['Facebook Ads', 'Instagram Ads', 'LinkedIn Ads'] },
      { id: 'google-ads', name: 'Google Ads & PPC', description: 'Pay-per-click advertising', popular: true, skills: ['Google Ads', 'PPC', 'SEM'] },
      { id: 'content-marketing', name: 'Content Marketing', description: 'Content strategy and creation', skills: ['Content Strategy', 'Blogging', 'Copywriting'] },
      { id: 'email-marketing', name: 'Email Marketing', description: 'Email campaigns and automation', skills: ['Mailchimp', 'Email Automation', 'Newsletter'] },
      { id: 'influencer-marketing', name: 'Influencer Marketing', description: 'Influencer outreach and campaigns', skills: ['Influencer Relations', 'Campaign Management'] },
      { id: 'video-marketing', name: 'Video Marketing', description: 'Video content strategy', skills: ['YouTube Marketing', 'Video Strategy'] },
      { id: 'affiliate-marketing', name: 'Affiliate Marketing', description: 'Affiliate program management', skills: ['Affiliate Programs', 'Partnership Marketing'] },
      { id: 'marketing-strategy', name: 'Marketing Strategy', description: 'Comprehensive marketing plans', skills: ['Marketing Planning', 'Brand Strategy'] },
      { id: 'analytics', name: 'Analytics & Tracking', description: 'Data analysis and reporting', skills: ['Google Analytics', 'Data Analysis', 'Reporting'] },
      { id: 'ecommerce-marketing', name: 'E-commerce Marketing', description: 'Online store marketing', skills: ['Shopify Marketing', 'Amazon', 'E-commerce'] },
    ],
  },

  // ============================================
  // 3. WRITING & TRANSLATION
  // ============================================
  {
    id: 'writing-translation',
    name: 'Writing & Translation',
    icon: 'PenTool',
    color: 'blue',
    gradient: 'from-blue-500 to-cyan-500',
    description: 'Content writing and language services',
    subcategories: [
      { id: 'blog-writing', name: 'Blog Writing', description: 'Blog posts and articles', popular: true, skills: ['Blogging', 'SEO Writing', 'Content Creation'] },
      { id: 'copywriting', name: 'Copywriting', description: 'Sales and marketing copy', popular: true, skills: ['Copywriting', 'Sales Copy', 'Marketing'] },
      { id: 'website-content', name: 'Website Content', description: 'Web page content', skills: ['Web Writing', 'UX Writing'] },
      { id: 'product-descriptions', name: 'Product Descriptions', description: 'E-commerce product copy', skills: ['Product Writing', 'E-commerce'] },
      { id: 'technical-writing', name: 'Technical Writing', description: 'Documentation and manuals', skills: ['Technical Documentation', 'API Documentation'] },
      { id: 'creative-writing', name: 'Creative Writing', description: 'Stories, scripts, and novels', skills: ['Creative Writing', 'Storytelling'] },
      { id: 'resume-writing', name: 'Resume & Cover Letters', description: 'Professional resume writing', popular: true, skills: ['Resume Writing', 'Career Services'] },
      { id: 'proofreading', name: 'Proofreading & Editing', description: 'Grammar and style editing', skills: ['Proofreading', 'Editing', 'Grammar'] },
      { id: 'translation', name: 'Translation', description: 'Document translation', popular: true, skills: ['Translation', 'Localization'] },
      { id: 'transcription', name: 'Transcription', description: 'Audio/video transcription', skills: ['Transcription', 'Audio Processing'] },
      { id: 'speech-writing', name: 'Speech Writing', description: 'Speeches and presentations', skills: ['Speech Writing', 'Public Speaking'] },
      { id: 'grant-writing', name: 'Grant & Proposal Writing', description: 'Business proposals and grants', skills: ['Grant Writing', 'Proposal Writing'] },
      { id: 'ghostwriting', name: 'Ghostwriting', description: 'Books and articles as ghostwriter', skills: ['Ghostwriting', 'Book Writing'] },
      { id: 'scriptwriting', name: 'Scriptwriting', description: 'Video and podcast scripts', skills: ['Scriptwriting', 'Screenwriting'] },
    ],
  },

  // ============================================
  // 4. VIDEO & ANIMATION
  // ============================================
  {
    id: 'video-animation',
    name: 'Video & Animation',
    icon: 'Film',
    color: 'purple',
    gradient: 'from-purple-500 to-violet-500',
    description: 'Video production and animation services',
    subcategories: [
      { id: 'video-editing', name: 'Video Editing', description: 'Professional video editing', popular: true, skills: ['Premiere Pro', 'Final Cut', 'DaVinci Resolve'] },
      { id: 'motion-graphics', name: 'Motion Graphics', description: 'Animated graphics and titles', popular: true, skills: ['After Effects', 'Motion Design'] },
      { id: 'animated-explainer', name: 'Animated Explainer Videos', description: 'Explainer video animation', popular: true, skills: ['Animation', 'Explainer Videos'] },
      { id: 'whiteboard-animation', name: 'Whiteboard Animation', description: 'Hand-drawn style animation', skills: ['Whiteboard Animation', 'VideoScribe'] },
      { id: '3d-animation', name: '3D Animation', description: '3D modeling and animation', skills: ['Blender', 'Cinema 4D', 'Maya', '3D Modeling'] },
      { id: 'logo-animation', name: 'Logo Animation', description: 'Animated logo intros', skills: ['Logo Animation', 'After Effects'] },
      { id: 'character-animation', name: 'Character Animation', description: 'Animated characters', skills: ['Character Animation', 'Rigging'] },
      { id: 'lyric-videos', name: 'Lyric & Music Videos', description: 'Music video production', skills: ['Music Videos', 'Lyric Videos'] },
      { id: 'product-videos', name: 'Product Videos', description: 'Product demos and promos', skills: ['Product Videos', 'Commercial Production'] },
      { id: 'social-media-video', name: 'Social Media Videos', description: 'Short-form video content', popular: true, skills: ['Social Media Video', 'Reels', 'TikTok'] },
      { id: 'drone-footage', name: 'Drone Videography', description: 'Aerial video footage', skills: ['Drone', 'Aerial Photography'] },
      { id: 'video-ads', name: 'Video Ads & Commercials', description: 'Advertisement production', skills: ['Commercial Production', 'Ad Creative'] },
      { id: 'subtitles-captions', name: 'Subtitles & Captions', description: 'Video captioning services', skills: ['Subtitling', 'Closed Captions'] },
    ],
  },

  // ============================================
  // 5. MUSIC & AUDIO
  // ============================================
  {
    id: 'music-audio',
    name: 'Music & Audio',
    icon: 'Music',
    color: 'indigo',
    gradient: 'from-indigo-500 to-purple-500',
    description: 'Music production and audio services',
    subcategories: [
      { id: 'music-production', name: 'Music Production', description: 'Original music creation', popular: true, skills: ['Music Production', 'FL Studio', 'Ableton', 'Logic Pro'] },
      { id: 'mixing-mastering', name: 'Mixing & Mastering', description: 'Professional audio mixing', popular: true, skills: ['Mixing', 'Mastering', 'Audio Engineering'] },
      { id: 'voice-over', name: 'Voice Over', description: 'Professional voice recordings', popular: true, skills: ['Voice Acting', 'Narration'] },
      { id: 'singers-vocalists', name: 'Singers & Vocalists', description: 'Vocal recording services', skills: ['Singing', 'Vocal Recording'] },
      { id: 'podcast-editing', name: 'Podcast Editing', description: 'Podcast production', popular: true, skills: ['Podcast Production', 'Audio Editing'] },
      { id: 'audiobook-production', name: 'Audiobook Production', description: 'Audiobook narration and editing', skills: ['Audiobook', 'Narration'] },
      { id: 'jingles-intros', name: 'Jingles & Intros', description: 'Commercial jingles and intros', skills: ['Jingles', 'Audio Branding'] },
      { id: 'sound-design', name: 'Sound Design', description: 'Sound effects and design', skills: ['Sound Design', 'SFX'] },
      { id: 'beat-making', name: 'Beat Making', description: 'Instrumental beats and tracks', skills: ['Beat Making', 'Hip Hop Production'] },
      { id: 'dj-drops', name: 'DJ Drops & Tags', description: 'Audio drops for DJs', skills: ['DJ Drops', 'Audio Tags'] },
      { id: 'audio-restoration', name: 'Audio Restoration', description: 'Audio cleanup and restoration', skills: ['Audio Restoration', 'Noise Removal'] },
    ],
  },

  // ============================================
  // 6. PROGRAMMING & TECH
  // ============================================
  {
    id: 'programming-tech',
    name: 'Programming & Tech',
    icon: 'Laptop',
    color: 'emerald',
    gradient: 'from-emerald-500 to-teal-500',
    description: 'Software development and technical services',
    isTech: true,
    subcategories: [
      { id: 'web-development', name: 'Web Development', description: 'Website and web app development', popular: true, skills: ['React', 'Vue', 'Angular', 'Node.js', 'Python', 'PHP'] },
      { id: 'mobile-development', name: 'Mobile App Development', description: 'iOS and Android apps', popular: true, skills: ['React Native', 'Flutter', 'Swift', 'Kotlin'] },
      { id: 'wordpress', name: 'WordPress Development', description: 'WordPress sites and plugins', popular: true, skills: ['WordPress', 'PHP', 'WooCommerce'] },
      { id: 'shopify', name: 'Shopify Development', description: 'Shopify stores and apps', skills: ['Shopify', 'Liquid', 'E-commerce'] },
      { id: 'ecommerce-dev', name: 'E-commerce Development', description: 'Online store development', skills: ['WooCommerce', 'Magento', 'Shopify'] },
      { id: 'api-development', name: 'API Development', description: 'Backend API services', skills: ['REST API', 'GraphQL', 'Node.js', 'Python'] },
      { id: 'database', name: 'Database Design', description: 'Database architecture', skills: ['PostgreSQL', 'MongoDB', 'MySQL', 'Redis'] },
      { id: 'cloud-devops', name: 'Cloud & DevOps', description: 'Cloud infrastructure', skills: ['AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes'] },
      { id: 'ai-ml', name: 'AI & Machine Learning', description: 'AI/ML solutions', popular: true, skills: ['Python', 'TensorFlow', 'PyTorch', 'OpenAI'] },
      { id: 'blockchain', name: 'Blockchain Development', description: 'Web3 and smart contracts', skills: ['Solidity', 'Web3', 'Ethereum', 'Smart Contracts'] },
      { id: 'game-development', name: 'Game Development', description: 'Video game development', skills: ['Unity', 'Unreal Engine', 'C#', 'C++'] },
      { id: 'desktop-apps', name: 'Desktop Applications', description: 'Desktop software', skills: ['Electron', 'C++', 'C#', '.NET'] },
      { id: 'automation-scripts', name: 'Automation & Scripts', description: 'Task automation', skills: ['Python', 'JavaScript', 'Automation'] },
      { id: 'qa-testing', name: 'QA & Testing', description: 'Software testing', skills: ['Testing', 'Selenium', 'Cypress', 'Jest'] },
      { id: 'cybersecurity', name: 'Cybersecurity', description: 'Security services', skills: ['Security', 'Penetration Testing', 'Security Audit'] },
    ],
  },

  // ============================================
  // 7. BUSINESS
  // ============================================
  {
    id: 'business',
    name: 'Business',
    icon: 'Briefcase',
    color: 'slate',
    gradient: 'from-slate-600 to-gray-700',
    description: 'Business consulting and support services',
    subcategories: [
      { id: 'virtual-assistant', name: 'Virtual Assistant', description: 'Administrative support', popular: true, skills: ['Admin Support', 'Scheduling', 'Email Management'] },
      { id: 'data-entry', name: 'Data Entry', description: 'Data input and processing', popular: true, skills: ['Data Entry', 'Excel', 'Typing'] },
      { id: 'project-management', name: 'Project Management', description: 'Project coordination', skills: ['Project Management', 'Agile', 'Scrum'] },
      { id: 'business-consulting', name: 'Business Consulting', description: 'Business strategy advice', skills: ['Business Strategy', 'Consulting'] },
      { id: 'market-research', name: 'Market Research', description: 'Industry and market analysis', skills: ['Research', 'Analysis', 'Reports'] },
      { id: 'financial-consulting', name: 'Financial Consulting', description: 'Financial planning and analysis', skills: ['Financial Analysis', 'Budgeting'] },
      { id: 'legal-consulting', name: 'Legal Consulting', description: 'Legal advice and contracts', skills: ['Legal', 'Contracts', 'Compliance'] },
      { id: 'hr-consulting', name: 'HR Consulting', description: 'Human resources support', skills: ['HR', 'Recruiting', 'Training'] },
      { id: 'business-plans', name: 'Business Plans', description: 'Business plan writing', skills: ['Business Planning', 'Financial Projections'] },
      { id: 'presentations', name: 'Presentations', description: 'Pitch decks and presentations', skills: ['PowerPoint', 'Pitch Decks', 'Keynote'] },
      { id: 'lead-generation', name: 'Lead Generation', description: 'B2B lead generation', skills: ['Lead Generation', 'Sales', 'CRM'] },
      { id: 'customer-service', name: 'Customer Service', description: 'Customer support services', skills: ['Customer Support', 'Live Chat', 'Email Support'] },
    ],
  },

  // ============================================
  // 8. DATA & ANALYTICS
  // ============================================
  {
    id: 'data-analytics',
    name: 'Data & Analytics',
    icon: 'BarChart3',
    color: 'cyan',
    gradient: 'from-cyan-500 to-blue-500',
    description: 'Data science and analytics services',
    isTech: true,
    subcategories: [
      { id: 'data-analysis', name: 'Data Analysis', description: 'Data interpretation and insights', popular: true, skills: ['Excel', 'SQL', 'Python', 'R'] },
      { id: 'data-visualization', name: 'Data Visualization', description: 'Charts and dashboards', popular: true, skills: ['Tableau', 'Power BI', 'D3.js'] },
      { id: 'data-science', name: 'Data Science', description: 'Advanced analytics and ML', skills: ['Python', 'Machine Learning', 'Statistics'] },
      { id: 'business-intelligence', name: 'Business Intelligence', description: 'BI solutions and reporting', skills: ['BI Tools', 'Reporting', 'Analytics'] },
      { id: 'database-management', name: 'Database Management', description: 'Database admin and optimization', skills: ['SQL', 'PostgreSQL', 'MongoDB'] },
      { id: 'web-scraping', name: 'Web Scraping', description: 'Data extraction services', skills: ['Python', 'Scraping', 'Data Collection'] },
      { id: 'excel-services', name: 'Excel & Spreadsheets', description: 'Advanced Excel work', skills: ['Excel', 'Google Sheets', 'VBA'] },
      { id: 'survey-analysis', name: 'Survey & Research Analysis', description: 'Survey data analysis', skills: ['SPSS', 'Research Analysis', 'Statistics'] },
    ],
  },

  // ============================================
  // 9. PHOTOGRAPHY
  // ============================================
  {
    id: 'photography',
    name: 'Photography',
    icon: 'Camera',
    color: 'amber',
    gradient: 'from-amber-500 to-yellow-500',
    description: 'Photography and photo editing services',
    subcategories: [
      { id: 'photo-editing', name: 'Photo Editing', description: 'Professional photo retouching', popular: true, skills: ['Photoshop', 'Lightroom', 'Photo Editing'] },
      { id: 'product-photography', name: 'Product Photography', description: 'E-commerce product photos', popular: true, skills: ['Product Photography', 'Studio Photography'] },
      { id: 'portrait-retouching', name: 'Portrait Retouching', description: 'Portrait enhancement', skills: ['Portrait Editing', 'Skin Retouching'] },
      { id: 'background-removal', name: 'Background Removal', description: 'Image background editing', popular: true, skills: ['Background Removal', 'Photo Manipulation'] },
      { id: 'photo-restoration', name: 'Photo Restoration', description: 'Old photo restoration', skills: ['Photo Restoration', 'Colorization'] },
      { id: 'real-estate-photo', name: 'Real Estate Photography', description: 'Property photo editing', skills: ['Real Estate', 'HDR Photography'] },
      { id: 'food-photography', name: 'Food Photography', description: 'Food styling and photography', skills: ['Food Photography', 'Styling'] },
      { id: 'fashion-photography', name: 'Fashion Photography', description: 'Fashion and editorial photos', skills: ['Fashion Photography', 'Editorial'] },
    ],
  },

  // ============================================
  // 10. LIFESTYLE
  // ============================================
  {
    id: 'lifestyle',
    name: 'Lifestyle',
    icon: 'Sparkles',
    color: 'rose',
    gradient: 'from-rose-500 to-pink-500',
    description: 'Personal and lifestyle services',
    subcategories: [
      { id: 'online-tutoring', name: 'Online Tutoring', description: 'Educational tutoring', popular: true, skills: ['Teaching', 'Education', 'Tutoring'] },
      { id: 'life-coaching', name: 'Life Coaching', description: 'Personal development coaching', skills: ['Coaching', 'Motivation', 'Personal Development'] },
      { id: 'career-counseling', name: 'Career Counseling', description: 'Career guidance', skills: ['Career Advice', 'Resume Review', 'Interview Prep'] },
      { id: 'fitness-coaching', name: 'Fitness Coaching', description: 'Fitness and nutrition plans', skills: ['Fitness', 'Nutrition', 'Personal Training'] },
      { id: 'gaming', name: 'Gaming', description: 'Game coaching and services', skills: ['Gaming', 'Esports', 'Game Coaching'] },
      { id: 'astrology-readings', name: 'Astrology & Readings', description: 'Spiritual and astrology services', skills: ['Astrology', 'Tarot', 'Spiritual Guidance'] },
      { id: 'travel-planning', name: 'Travel Planning', description: 'Trip planning services', skills: ['Travel Planning', 'Itinerary', 'Tourism'] },
      { id: 'event-planning', name: 'Event Planning', description: 'Event coordination', skills: ['Event Planning', 'Coordination', 'Logistics'] },
    ],
  },

  // ============================================
  // 11. AI SERVICES
  // ============================================
  {
    id: 'ai-services',
    name: 'AI Services',
    icon: 'Bot',
    color: 'violet',
    gradient: 'from-violet-500 to-purple-500',
    description: 'AI-powered services and solutions',
    isTech: true,
    subcategories: [
      { id: 'ai-chatbots', name: 'AI Chatbots', description: 'Custom chatbot development', popular: true, skills: ['ChatGPT', 'Dialogflow', 'Bot Development'] },
      { id: 'ai-content', name: 'AI Content Generation', description: 'AI-assisted content creation', popular: true, skills: ['AI Writing', 'GPT', 'Content AI'] },
      { id: 'ai-art', name: 'AI Art & Images', description: 'AI image generation', popular: true, skills: ['Midjourney', 'DALL-E', 'Stable Diffusion'] },
      { id: 'ai-voice', name: 'AI Voice & Audio', description: 'AI voice synthesis', skills: ['AI Voice', 'Text-to-Speech', 'Voice Cloning'] },
      { id: 'ai-video', name: 'AI Video Generation', description: 'AI video creation', skills: ['AI Video', 'Synthesia', 'D-ID'] },
      { id: 'ai-automation', name: 'AI Automation', description: 'AI workflow automation', skills: ['AI Automation', 'No-Code AI', 'Zapier'] },
      { id: 'ai-training', name: 'AI Model Training', description: 'Custom AI model development', skills: ['Machine Learning', 'Model Training', 'Fine-tuning'] },
      { id: 'prompt-engineering', name: 'Prompt Engineering', description: 'AI prompt optimization', skills: ['Prompt Engineering', 'ChatGPT', 'AI Optimization'] },
    ],
  },
];

// ============================================
// Helper Functions
// ============================================

/**
 * Get all categories
 */
export function getAllCategories(): ServiceCategory[] {
  return SERVICE_CATEGORIES;
}

/**
 * Get category by ID
 */
export function getCategoryById(id: string): ServiceCategory | undefined {
  return SERVICE_CATEGORIES.find(cat => cat.id === id);
}

/**
 * Get subcategory by ID
 */
export function getSubcategoryById(categoryId: string, subcategoryId: string): SubCategory | undefined {
  const category = getCategoryById(categoryId);
  return category?.subcategories.find(sub => sub.id === subcategoryId);
}

/**
 * Get all popular subcategories across all categories
 */
export function getPopularSubcategories(): Array<SubCategory & { categoryId: string; categoryName: string }> {
  const popular: Array<SubCategory & { categoryId: string; categoryName: string }> = [];

  SERVICE_CATEGORIES.forEach(category => {
    category.subcategories
      .filter(sub => sub.popular)
      .forEach(sub => {
        popular.push({
          ...sub,
          categoryId: category.id,
          categoryName: category.name,
        });
      });
  });

  return popular;
}

/**
 * Get tech categories (need tech stack selection)
 */
export function getTechCategories(): ServiceCategory[] {
  return SERVICE_CATEGORIES.filter(cat => cat.isTech);
}

/**
 * Get non-tech categories
 */
export function getNonTechCategories(): ServiceCategory[] {
  return SERVICE_CATEGORIES.filter(cat => !cat.isTech);
}

/**
 * Search categories and subcategories
 */
export function searchCategories(query: string): Array<{
  type: 'category' | 'subcategory';
  category: ServiceCategory;
  subcategory?: SubCategory;
}> {
  const results: Array<{
    type: 'category' | 'subcategory';
    category: ServiceCategory;
    subcategory?: SubCategory;
  }> = [];

  const lowerQuery = query.toLowerCase();

  SERVICE_CATEGORIES.forEach(category => {
    // Check category name
    if (category.name.toLowerCase().includes(lowerQuery)) {
      results.push({ type: 'category', category });
    }

    // Check subcategories
    category.subcategories.forEach(sub => {
      if (
        sub.name.toLowerCase().includes(lowerQuery) ||
        sub.description.toLowerCase().includes(lowerQuery) ||
        sub.skills?.some(skill => skill.toLowerCase().includes(lowerQuery))
      ) {
        results.push({ type: 'subcategory', category, subcategory: sub });
      }
    });
  });

  return results;
}

/**
 * Get all skills from all categories
 */
export function getAllSkills(): string[] {
  const skillSet = new Set<string>();

  SERVICE_CATEGORIES.forEach(category => {
    category.subcategories.forEach(sub => {
      sub.skills?.forEach(skill => skillSet.add(skill));
    });
  });

  return Array.from(skillSet).sort();
}

/**
 * Get skills by category
 */
export function getSkillsByCategory(categoryId: string): string[] {
  const category = getCategoryById(categoryId);
  if (!category) return [];

  const skillSet = new Set<string>();
  category.subcategories.forEach(sub => {
    sub.skills?.forEach(skill => skillSet.add(skill));
  });

  return Array.from(skillSet).sort();
}

// Export for backward compatibility
export const LEGACY_TECH_STACK = [
  'React', 'Next.js', 'Vue.js', 'Angular',
  'Node.js', 'NestJS', 'Express', 'Django',
  'PostgreSQL', 'MongoDB', 'MySQL', 'Redis',
  'TypeScript', 'Python', 'Java', 'Go',
  'React Native', 'Flutter', 'Swift', 'Kotlin',
  'AWS', 'Docker', 'Kubernetes', 'GraphQL'
];
