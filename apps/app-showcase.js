// App Showcase JavaScript - Interactive Features

document.addEventListener('DOMContentLoaded', () => {
  initFAQ();
  initMobileMenu();
  initScrollAnimations();
  initSmoothScroll();
});

// FAQ Accordion
function initFAQ() {
  const faqItems = document.querySelectorAll('.faq-item');

  faqItems.forEach(item => {
    const question = item.querySelector('.faq-question');

    question.addEventListener('click', () => {
      const isActive = item.classList.contains('active');

      // Close all FAQ items
      faqItems.forEach(otherItem => {
        otherItem.classList.remove('active');
      });

      // Open clicked item if it wasn't active
      if (!isActive) {
        item.classList.add('active');
      }
    });
  });
}

// Mobile Menu Toggle
function initMobileMenu() {
  const toggle = document.querySelector('.mobile-menu-toggle');
  const navLinks = document.querySelector('.nav-links');

  if (!toggle || !navLinks) return;

  toggle.addEventListener('click', () => {
    navLinks.classList.toggle('active');
    const isActive = navLinks.classList.contains('active');
    toggle.textContent = isActive ? '✕' : '☰';
  });

  // Close menu when clicking a link
  const links = navLinks.querySelectorAll('.nav-link');
  links.forEach(link => {
    link.addEventListener('click', () => {
      navLinks.classList.remove('active');
      toggle.textContent = '☰';
    });
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!toggle.contains(e.target) && !navLinks.contains(e.target)) {
      navLinks.classList.remove('active');
      toggle.textContent = '☰';
    }
  });
}

// Scroll Animations with Intersection Observer
function initScrollAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  // Observe elements with animation classes
  const animatedElements = document.querySelectorAll(
    '.feature-card, .magazine-section, .faq-item, .screenshot-item'
  );

  animatedElements.forEach(el => {
    observer.observe(el);
  });
}

// Smooth Scroll for Anchor Links
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      const href = this.getAttribute('href');
      if (href === '#') return;

      e.preventDefault();
      const target = document.querySelector(href);

      if (target) {
        const navHeight = document.querySelector('.app-nav')?.offsetHeight || 0;
        const targetPosition = target.offsetTop - navHeight - 20;

        window.scrollTo({
          top: targetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

// Navbar Background on Scroll
window.addEventListener('scroll', () => {
  const nav = document.querySelector('.app-nav');
  if (!nav) return;

  if (window.scrollY > 50) {
    nav.style.background = 'var(--glass-bg)';
    nav.style.backdropFilter = 'blur(20px) saturate(180%)';
  } else {
    nav.style.background = 'var(--glass-bg)';
  }
});

// Image Lazy Loading with Fade-in Effect
if ('IntersectionObserver' in window) {
  const imageObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const img = entry.target;
        if (img.dataset.src) {
          img.src = img.dataset.src;
          img.removeAttribute('data-src');
          img.style.opacity = '0';
          img.addEventListener('load', () => {
            img.style.transition = 'opacity 0.5s';
            img.style.opacity = '1';
          });
        }
        observer.unobserve(img);
      }
    });
  });

  document.querySelectorAll('img[data-src]').forEach(img => {
    imageObserver.observe(img);
  });
}

// Parallax Effect for Hero Section
window.addEventListener('scroll', () => {
  const heroImage = document.querySelector('.hero-phone');
  if (!heroImage) return;

  const scrolled = window.pageYOffset;
  const rate = scrolled * 0.3;

  heroImage.style.transform = `translateY(${rate}px)`;
});

// Active Navigation Link Based on Scroll Position
function updateActiveNavLink() {
  const sections = document.querySelectorAll('section[id]');
  const navLinks = document.querySelectorAll('.nav-link');

  let current = '';

  sections.forEach(section => {
    const sectionTop = section.offsetTop;

    if (window.pageYOffset >= sectionTop - 200) {
      current = section.getAttribute('id');
    }
  });

  navLinks.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === `#${current}`) {
      link.classList.add('active');
    }
  });
}

window.addEventListener('scroll', updateActiveNavLink);

// Add stagger animation to feature cards
function staggerAnimation(selector, delay = 100) {
  const elements = document.querySelectorAll(selector);
  elements.forEach((el, index) => {
    el.style.animationDelay = `${index * delay}ms`;
  });
}

// Initialize stagger animations
staggerAnimation('.feature-card', 100);
staggerAnimation('.screenshot-item', 100);
staggerAnimation('.faq-item', 100);

document.getElementById('year').textContent = new Date().getFullYear();