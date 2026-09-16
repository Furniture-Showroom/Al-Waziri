/**
 * config.js
 * Central, PUBLIC configuration. Loaded on every page (public + admin).
 *
 * SECURITY: never put secrets here. This file ships to every visitor's
 * browser as plain text. The ImgBB key, password hashes, and session
 * signing all live server-side in Google Apps Script Script Properties.
 *
 * Replace apiBaseUrl with your deployed Google Apps Script Web App URL
 * (see README.md → "النشر / Deployment").
 */
'use strict';

const SITE_CONFIG = {
  businessName: 'معرض الحاج حماده نافع وزيري للأثاث',
  shortName: 'معرض حماده نافع',
  tagline: 'تفصيل وتصميم الأثاث بأعلى جودة',
  phone: '+201114010151',
  whatsapp: '+201114010151',
  facebook: 'https://www.facebook.com/profile.php?id=100076597119718',

  // TODO: set this to your deployed Apps Script Web App "/exec" URL.
  apiBaseUrl: 'https://script.google.com/macros/s/REPLACE_WITH_YOUR_DEPLOYMENT_ID/exec',

  categories: [
    { id: 'bedrooms', label: 'غرف نوم' },
    { id: 'kids', label: 'غرف أطفال' },
    { id: 'reception', label: 'أنتريه' },
    { id: 'dining', label: 'سفرة' },
    { id: 'corners', label: 'ركنات' },
    { id: 'kitchens', label: 'مطابخ' },
    { id: 'home-furniture', label: 'أثاث منزلي' },
  ],

  // Upload constraints (kept here so admin.js and README stay in sync).
  upload: {
    maxFileSizeBytes: 8 * 1024 * 1024, // 8MB per image
    maxFilesPerWork: 20,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
  },
};

// Freeze one level deep so accidental mutation elsewhere fails loudly in dev.
Object.freeze(SITE_CONFIG);
Object.freeze(SITE_CONFIG.categories);
Object.freeze(SITE_CONFIG.upload);
