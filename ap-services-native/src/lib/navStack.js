/**
 * Prefer popping to an existing profile instead of stacking Profile → Video → Profile.
 */
export function openCreatorProfile(navigation, { userId, name } = {}) {
  const id = userId != null ? String(userId) : '';
  if (!id || !navigation) return;

  const state = navigation.getState?.();
  const routes = state?.routes || [];
  for (let i = routes.length - 1; i >= 0; i -= 1) {
    const r = routes[i];
    if (r?.name === 'CreatorProfile' && String(r.params?.userId || '') === id) {
      const pop = routes.length - 1 - i;
      if (pop > 0 && typeof navigation.pop === 'function') navigation.pop(pop);
      else if (navigation.canGoBack?.()) navigation.goBack();
      return;
    }
    if (r?.name === 'Main') {
      const nested = r.state?.routes || [];
      const focused = nested[r.state?.index ?? nested.length - 1];
      if (focused?.name === 'Profile') {
        const profileId = String(focused.params?.userId || '');
        if (!profileId || profileId === id) {
          if (navigation.canGoBack?.()) navigation.goBack();
          return;
        }
      }
    }
  }
  navigation.navigate('CreatorProfile', { userId: id, name });
}

export function goBackOrPop(navigation) {
  if (navigation?.canGoBack?.()) {
    navigation.goBack();
    return;
  }
  navigation?.navigate?.('Main');
}
