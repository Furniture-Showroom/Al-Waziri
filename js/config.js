/**
 * config.js
 * Central, PUBLIC configuration. Loaded on every page (public + admin).
 *
 * SECURITY: never put secrets here. This file ships to every visitor's
 * browser as plain text. The ImgBB key, password hashes, and session
 * signing all live server-side in Google Apps Script Script Properties.
 */
'use strict';

const SITE_CONFIG = {
  businessName: 'معرض الحاج حماده نافع وزيري للأثاث',
  shortName: 'معرض حماده نافع',
  tagline: 'تفصيل وتصميم الأثاث بأعلى جودة',
  phone: '+201114010151',
  whatsapp: '+201114010151',
  facebook: 'https://www.facebook.com/profile.php?id=100076597119718',

  apiBaseUrl: 'https://script.google.com/macros/s/AKfycbwTjRGv3clNjdZKFh2dLWj3yfF9c7EOgF3gyfn2UXSn9wfzmfK-ZBeRTam05TMnXPtE/exec',

  categories: [
    { id: 'bedrooms', label: 'غرف نوم' },
    { id: 'kids', label: 'غرف أطفال' },
    { id: 'reception', label: 'أنتريه' },
    { id: 'dining', label: 'سفرة' },
    { id: 'corners', label: 'ركنات' },
    { id: 'kitchens', label: 'مطابخ' },
    { id: 'home-furniture', label: 'أثاث منزلي' },
  ],

  upload: {
    maxFileSizeBytes: 8 * 1024 * 1024,
    maxFilesPerWork: 20,
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
  },
};

Object.freeze(SITE_CONFIG);
Object.freeze(SITE_CONFIG.categories);
Object.freeze(SITE_CONFIG.upload);
