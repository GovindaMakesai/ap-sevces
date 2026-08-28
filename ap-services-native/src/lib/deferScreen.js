/**
 * Deferred screen loader — module code runs on first navigate, not at app boot.
 * Keeps cold start light vs importing ~60 screens up front.
 */
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { colors } from '../config/theme';

function Fallback() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.creamBg }}>
      <ActivityIndicator color={colors.gold500} />
    </View>
  );
}

export function deferScreen(loader, pick = (m) => m.default) {
  let Cached = null;
  return function DeferredScreen(props) {
    const [Comp, setComp] = useState(() => Cached);
    useEffect(() => {
      if (Cached) return undefined;
      let alive = true;
      Promise.resolve()
        .then(() => loader())
        .then((mod) => {
          const next = pick(mod) || mod.default || mod;
          Cached = next;
          if (alive) setComp(() => next);
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, []);
    if (!Comp) {
      if (!Cached) return <Fallback />;
      return <Cached {...props} />;
    }
    return <Comp {...props} />;
  };
}

/** Sync defer via require — evaluates module on first render only */
export function requireScreen(factory, pick = (m) => m.default) {
  let Cached = null;
  return function RequiredScreen(props) {
    if (!Cached) Cached = pick(factory()) || factory().default;
    return <Cached {...props} />;
  };
}
