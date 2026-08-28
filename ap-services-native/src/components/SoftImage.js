import React from 'react';
import { Image, StyleSheet } from 'react-native';

let ExpoImage = null;
try {
  // Optional — install with: npx expo install expo-image
  ExpoImage = require('expo-image').Image;
} catch (_e) {
  ExpoImage = null;
}

/**
 * Cached image when expo-image is present; falls back to RN Image.
 */
export default function SoftImage({ uri, style, recyclingKey, contentFit = 'cover' }) {
  if (!uri) return null;
  if (ExpoImage) {
    return (
      <ExpoImage
        source={{ uri }}
        style={style}
        contentFit={contentFit}
        cachePolicy="memory-disk"
        recyclingKey={recyclingKey || uri}
        transition={0}
      />
    );
  }
  return <Image source={{ uri }} style={style} resizeMode={contentFit === 'contain' ? 'contain' : 'cover'} />;
}

const styles = StyleSheet.create({});
