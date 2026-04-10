# Integration Example - Hero Slider

## How to Replace the Hero Section in LandingPage.tsx

### Step 1: Import the Component

Add this import at the top of your `LandingPage.tsx` file:

```tsx
import { HeroSlider } from '@/components/landing';
```

### Step 2: Replace the Old Hero Section

Find the hero section in your landing page (approximately lines 573-736) and replace it with the new component:

**BEFORE:**
```tsx
{/* Animated Hero Slider */}
<section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden min-h-[90vh] flex items-center">
  <div className="absolute inset-0 -z-10">
    {/* ... 160+ lines of inline code ... */}
  </div>

  <div className="max-w-7xl mx-auto w-full">
    <AnimatePresence mode="wait">
      {/* ... more inline code ... */}
    </AnimatePresence>

    {/* Slider Controls */}
    <div className="flex items-center justify-center space-x-6 mt-12">
      {/* ... navigation controls ... */}
    </div>
  </div>
</section>
```

**AFTER:**
```tsx
<HeroSlider />
```

That's it! Just one line instead of 160+ lines.

### Step 3: Remove Unused State and Effects

Since the HeroSlider manages its own state, you can remove these lines from your landing page:

```tsx
// REMOVE THESE:
const [currentSlide, setCurrentSlide] = useState(0);
const [isAutoPlay, setIsAutoPlay] = useState(true);

// REMOVE THIS useEffect:
useEffect(() => {
  if (isAutoPlay) {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % heroSlides.length);
    }, 5000);
    return () => clearInterval(timer);
  }
}, [isAutoPlay, heroSlides.length]);

// REMOVE THIS DATA:
const heroSlides = [
  // ... all the slide data
];

// REMOVE THESE COMPONENTS:
const SearchMockup = () => { ... };
const DashboardMockup = () => { ... };
const PaymentMockup = () => { ... };
const GlobalMockup = () => { ... };
const renderVisual = (type) => { ... };
```

All of this is now handled by the reusable components!

### Step 4: Customize (Optional)

If you want to customize the auto-play interval:

```tsx
<HeroSlider autoPlayInterval={3000} /> {/* 3 seconds instead of default 5 */}
```

## Complete Example

Here's what your landing page component should look like after integration:

```tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { /* your icons */ } from 'lucide-react';
import { HeroSlider } from '@/components/landing'; // NEW IMPORT

const Team@OnceLanding = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // Removed: currentSlide, isAutoPlay state
  // Removed: heroSlides data
  // Removed: mockup components
  // Removed: useEffect for auto-play

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-purple-50 text-gray-900 overflow-x-hidden">
      {/* Navigation */}
      <motion.nav {...props}>
        {/* Your navigation code */}
      </motion.nav>

      {/* NEW: Replace entire hero section with this single line */}
      <HeroSlider />

      {/* Timeline - How It Works */}
      <section id="how-it-works" className="...">
        {/* Your timeline code */}
      </section>

      {/* Rest of your landing page */}
      {/* ... */}
    </div>
  );
};

export default Team@OnceLanding;
```

## Benefits

### Before (Old Approach)
- 160+ lines of inline code
- Hard to maintain
- Difficult to reuse
- Mixed concerns (data, UI, logic)
- State management in parent component

### After (New Approach)
- 1 line of code in landing page
- Easy to maintain
- Fully reusable across projects
- Clean separation of concerns
- Self-contained state management
- Can be used in multiple pages
- Easy to customize via props

## Testing

After integration, verify:

1. ✅ All 4 slides display correctly
2. ✅ Auto-play works (slides change every 5 seconds)
3. ✅ Navigation buttons work (prev/next)
4. ✅ Dot indicators work (click to jump to slide)
5. ✅ Play/pause button toggles auto-play
6. ✅ All animations are smooth
7. ✅ Mockups render correctly on each slide
8. ✅ Responsive design works on mobile/tablet
9. ✅ Background gradient orbs animate
10. ✅ Hover effects work on buttons

## Troubleshooting

### Issue: Component not found
**Solution:** Make sure the import path is correct:
```tsx
import { HeroSlider } from '@/components/landing';
```

### Issue: Styles not applied
**Solution:** Ensure Tailwind CSS is configured to scan the components directory:
```js
// tailwind.config.js
content: [
  "./src/**/*.{js,ts,jsx,tsx}",
]
```

### Issue: Animations not working
**Solution:** Verify `framer-motion` is installed:
```bash
npm install framer-motion
```

### Issue: Icons missing
**Solution:** Install `lucide-react`:
```bash
npm install lucide-react
```

## Next Steps

After successfully integrating the Hero Slider, consider:

1. Customizing the slide content in `/src/lib/landing-data.ts`
2. Creating custom mockup components for your specific use case
3. Adjusting animations in `/src/components/landing/HeroSlider.tsx`
4. Integrating other landing page sections (Timeline, Comparison Table, etc.)

## Support

For questions or issues:
- Check the README.md in `/src/components/landing/`
- Review the component source code
- Verify all dependencies are installed
- Ensure TypeScript types are correct
