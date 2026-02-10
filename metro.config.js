// 개발 시 항상 최신 번들 로드되도록 캐시 리셋 (예전 번들 방지)
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);
config.resetCache = true;

module.exports = config;
