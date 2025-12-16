# Apps Showcase - Easy Update Guide

This directory contains beautiful, animated showcase pages for your iOS applications. Each app has its own dedicated page with a consistent look and feel, light/dark mode support, and smooth animations.

## 📁 Directory Structure

```
apps/
├── index.html              # Main apps landing page
├── app-showcase.css        # Shared styles for all app pages
├── app-showcase.js         # Shared JavaScript for interactivity
├── README.md              # This file
├── enter-space/
│   ├── index.html
│   └── assets/
│       └── images/        # Put Enter Space images here
├── ari-helper/
│   ├── index.html
│   └── assets/
│       └── images/        # Put Ari Helper images here
├── mi-speaks/
│   ├── index.html
│   └── assets/
│       └── images/        # Put Mi Speaks images here
└── embr/
    ├── index.html
    └── assets/
        └── images/        # Put Embr images here
```

## 🖼️ How to Update Images

### Required Images for Each App

Each app directory (`assets/images/`) should contain:

1. **hero-mockup.png** - Main hero image (recommended: 400x800px)
2. **feature-1.png** - First feature showcase image (recommended: 600x400px)
3. **feature-2.png** - Second feature showcase image (recommended: 600x400px)
4. **feature-3.png** - Third feature showcase image (recommended: 600x400px)
5. **screenshot-1.png** through **screenshot-4.png** - App screenshots (recommended: 1170x2532px - iPhone size)

### Adding Images

1. Navigate to the app's images folder:
   ```
   apps/[app-name]/assets/images/
   ```

2. Add your images with the exact names listed above

3. The pages will automatically display your images!

**Note:** If images are missing, placeholder gradients will display instead (no broken images).

## ✏️ How to Update Content

### Updating App Information

Each app's `index.html` file contains easy-to-edit sections:

#### 1. Hero Section
```html
<p class="hero-subtitle">🚀 App Name</p>
<h1 class="hero-title">Your Main Headline</h1>
<p class="hero-description">
  Your app description goes here...
</p>
```

#### 2. Features
Find the `feature-grid` section and edit each feature card:
```html
<div class="feature-card">
  <div class="feature-icon">🎯</div>
  <h3 class="feature-title">Feature Name</h3>
  <p class="feature-description">
    Feature description...
  </p>
</div>
```

#### 3. Magazine Sections
Find the `magazine-section` divs and update:
```html
<div class="magazine-content">
  <h2>Section Title</h2>
  <p>Your content here...</p>
</div>
```

#### 4. FAQ Items
Find the `faq-section` and edit questions/answers:
```html
<div class="faq-item">
  <button class="faq-question">
    <span>Your question here?</span>
    <span class="faq-icon">▼</span>
  </button>
  <div class="faq-answer">
    <p>Your answer here...</p>
  </div>
</div>
```

## 🎨 Customizing Colors

Each app has its own color scheme. To change colors, edit the CSS variables in the `<style>` section of each app's `index.html`:

```css
:root {
  --app-primary: #667eea;    /* Main color */
  --app-secondary: #764ba2;  /* Secondary color */
  --app-accent: #f093fb;     /* Accent color */
}
```

### Current Color Schemes:
- **Enter Space**: Purple/Blue (#667eea, #764ba2)
- **Ari Helper**: Pink/Red (#f093fb, #f5576c)
- **Mi Speaks**: Blue/Cyan (#4facfe, #00f2fe)
- **Embr**: Pink/Yellow (#fa709a, #fee140)

## 🔗 Updating App Store Links

Find and replace the App Store URL in each app's HTML:

```html
<a href="YOUR_APP_STORE_URL" class="btn-buy" target="_blank">
  Download on App Store
</a>
```

## 📱 Features Built-In

✅ **Light & Dark Mode** - Automatic based on system preference
✅ **Fully Responsive** - Beautiful on mobile, tablet, and desktop
✅ **Smooth Animations** - Fade-in, float, and scale effects
✅ **Accordion FAQ** - Click to expand/collapse
✅ **Glassmorphic Design** - Modern frosted glass effect
✅ **Mobile Menu** - Hamburger menu on small screens
✅ **Lazy Loading** - Images load as needed
✅ **Cross-linking** - Easy navigation between apps

## 🎯 Quick Tasks

### Add a New Feature Card
1. Copy an existing `<div class="feature-card">` block
2. Update the icon emoji, title, and description
3. Paste it inside the `<div class="feature-grid">` section

### Add More Screenshots
1. Add more `<div class="screenshot-item">` blocks in the screenshots section
2. Update the image src to match your new screenshot filename
3. The grid will automatically adjust!

### Add More FAQ Items
1. Copy an existing `<div class="faq-item">` block
2. Update the question and answer text
3. Paste it in the FAQ section

### Update App Icon/Emoji
In the main apps landing page (`index.html`), find:
```html
<div class="app-icon">🚀</div>
```
Change the emoji to any you like!

## 🚀 Advanced Customization

### Change Animation Speed
Edit `app-showcase.css` and modify:
```css
--transition-fast: 0.2s;
--transition-base: 0.3s;
--transition-slow: 0.5s;
```

### Adjust Spacing
Modify spacing variables in `app-showcase.css`:
```css
--spacing-sm: 1rem;
--spacing-md: 1.5rem;
--spacing-lg: 2rem;
--spacing-xl: 3rem;
```

### Change Fonts
Update font variables in `app-showcase.css`:
```css
--font-primary: -apple-system, BlinkMacSystemFont, ...;
--font-heading: "SF Pro Display", ...;
```

## 🐛 Troubleshooting

**Images not showing?**
- Check that image filenames match exactly (case-sensitive)
- Ensure images are in the correct `assets/images/` folder
- Verify image file formats are web-compatible (PNG, JPG, WebP)

**Animations not working?**
- Clear browser cache
- Check if JavaScript is enabled
- Ensure `app-showcase.js` is loading properly

**Layout looks broken on mobile?**
- Test in actual devices or browser DevTools
- Check for custom CSS that might override responsive styles

## 📞 Need Help?

- All styling is in `app-showcase.css`
- All interactivity is in `app-showcase.js`
- Each app page is self-contained in its own folder
- Content is easy to find and edit directly in each `index.html`

## 🎉 Tips for Best Results

1. **Use high-quality images** - Screenshots should be actual device screenshots
2. **Keep descriptions concise** - Short, punchy text works best
3. **Test on mobile** - Most users will view on phones
4. **Update all apps consistently** - Maintain the same quality across all pages
5. **Optimize images** - Compress images to load faster (use tools like TinyPNG)

---

**Made with ❤️ for showcasing amazing iOS apps!**
