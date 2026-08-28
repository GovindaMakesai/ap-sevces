import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { ringSkinById } from '../config/rings';

/**
 * 3D finger-worn CP ring — matches webview cp-rings.css perspective (not a flat badge).
 */
function CoupleRing({ ringId, ring, size = 56, glow = true }) {
  const spec = ringSkinById(ring?.id || ringId);
  const outer = Math.round(size * 0.78);
  const hole = Math.round(outer * 0.54);
  const band = Math.round((outer - hole) / 2);
  const gem = Math.round(size * 0.17);
  const crown = Math.round(size * 0.44);
  const pad = Math.round(size * 0.14);

  return (
    <View style={[styles.wrap, { width: size + pad * 2, height: size + pad * 2 }]}>
      {glow ? (
        <View
          pointerEvents="none"
          style={[
            styles.glow,
            {
              width: size + pad,
              height: size + pad,
              borderRadius: (size + pad) / 2,
              backgroundColor: spec.glow,
            },
          ]}
        />
      ) : null}

      <View style={[styles.stage, { width: size, height: size }]}>
        <View style={styles.view3d}>
          {/* Band sits around the finger opening */}
          <View style={[styles.bandWrap, { width: outer, height: outer, marginLeft: -outer / 2, marginTop: -outer / 2 }]}>
            <LinearGradient
              colors={spec.metal}
              start={{ x: 0.15, y: 0 }}
              end={{ x: 0.85, y: 1 }}
              style={[styles.band, { width: outer, height: outer, borderRadius: outer / 2 }]}
            >
              <View style={[styles.bandInnerCut, { width: hole, height: hole, borderRadius: hole / 2 }]}>
                <LinearGradient
                  colors={['#f0c4a8', '#d4956a', '#8b5e3c', '#5c3d28']}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                  style={[styles.finger, { width: hole, height: hole, borderRadius: hole / 2 }]}
                />
                <View style={[styles.holeShadow, { width: hole * 0.92, height: hole * 0.92, borderRadius: hole / 2 }]} />
              </View>
            </LinearGradient>

            {/* Inner band edge — depth on the metal */}
            <View
              pointerEvents="none"
              style={[
                styles.bandEdge,
                {
                  width: outer - 4,
                  height: outer - 4,
                  borderRadius: (outer - 4) / 2,
                  borderWidth: Math.max(2, band * 0.45),
                },
              ]}
            />

            {/* Top highlight on band */}
            <View
              pointerEvents="none"
              style={[
                styles.bandHighlight,
                {
                  width: outer - band * 2,
                  height: band * 1.1,
                  top: band * 0.35,
                  borderTopLeftRadius: outer,
                  borderTopRightRadius: outer,
                },
              ]}
            />
          </View>

          {/* Setting + gem on top of band */}
          <View style={[styles.crown, { width: crown, height: crown, marginLeft: -crown / 2, top: size * 0.02 }]}>
            <View style={[styles.prongBase, { width: crown * 0.9, height: crown * 0.55, bottom: 0 }]} />
            <View style={[styles.gemMount, { width: gem * 1.35, height: gem * 1.35, top: -gem * 0.15 }]}>
              <LinearGradient
                colors={spec.gem}
                start={{ x: 0.2, y: 0 }}
                end={{ x: 0.75, y: 1 }}
                style={[styles.gem, { width: gem, height: gem * 1.15 }]}
              />
              <View style={[styles.gemShine, { width: gem * 0.22, height: gem * 0.5, top: gem * 0.12, left: gem * 0.52 }]} />
              <View style={[styles.gemFacet, { width: gem * 0.12, height: gem * 0.35, top: gem * 0.55, left: gem * 0.28 }]} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    opacity: 0.32,
  },
  stage: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  view3d: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    transform: [
      { perspective: 520 },
      { rotateX: '54deg' },
      { rotateY: '-24deg' },
      { rotateZ: '0deg' },
    ],
  },
  bandWrap: {
    position: 'absolute',
    left: '50%',
    top: '54%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  band: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 6,
    elevation: 6,
  },
  bandInnerCut: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#1a0c10',
  },
  finger: {
    opacity: 0.95,
  },
  holeShadow: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.35)',
    top: '4%',
  },
  bandEdge: {
    position: 'absolute',
    borderColor: 'rgba(60,40,10,0.55)',
    opacity: 0.85,
  },
  bandHighlight: {
    position: 'absolute',
    alignSelf: 'center',
    backgroundColor: 'rgba(255,255,255,0.24)',
  },
  crown: {
    position: 'absolute',
    left: '50%',
    alignItems: 'center',
    top: 0,
  },
  prongBase: {
    position: 'absolute',
    backgroundColor: 'rgba(212,175,55,0.92)',
    borderRadius: 3,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.45)',
    transform: [{ rotate: '45deg' }],
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
    elevation: 3,
  },
  gemMount: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  gem: {
    borderRadius: 3,
    transform: [{ rotate: '45deg' }],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 5,
  },
  gemShine: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.72)',
    borderRadius: 2,
    transform: [{ rotate: '-18deg' }],
  },
  gemFacet: {
    position: 'absolute',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 1,
    transform: [{ rotate: '12deg' }],
  },
});

export default memo(CoupleRing);
