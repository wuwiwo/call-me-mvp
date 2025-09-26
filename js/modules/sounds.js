// sounds.js
import { CONFIG } from './config.js';

class SoundManager {
  constructor() {
    this.audioCache = new Map();
    this.enabled = true;
  }

  // 预加载音效
  async preload() {
    const allSounds = [
      ...Object.values(CONFIG.soundEffects.avatars),
      ...Object.values(CONFIG.soundEffects.notifications)
    ];
    
    await Promise.all(
      allSounds.map(url => this.load(url))
    );
  }

  // 加载单个音效
  async load(url) {
    if (!this.audioCache.has(url)) {
      const audio = new Audio(url);
      audio.load();
      this.audioCache.set(url, audio);
    }
  }

  // 播放音效
  play(url) {
    if (!this.enabled) return;
    
    const audio = this.audioCache.get(url);
    if (audio) {
      audio.currentTime = 0; // 重置播放位置
      audio.play().catch(e => console.warn("音效播放失败:", e));
    }
  }

  // 头像点击音效
  playAvatarSound(emoji) {
    const sound = CONFIG.soundEffects.avatars[emoji] || 
                 CONFIG.soundEffects.avatars.default;
    this.play(sound);
  }

  // 操作反馈音效
  playNotificationSound(isSuccess) {
    const type = isSuccess ? 'success' : 'error';
    this.play(CONFIG.soundEffects.notifications[type]);
  }

  // 全局开关
  toggle(enable) {
    this.enabled = enable;
  }
}

export const soundManager = new SoundManager();