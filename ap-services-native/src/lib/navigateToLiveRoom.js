/**
 * Leave a minimized / background live session before opening another room.
 */
export async function navigateToLiveRoom(navigation, liveMini, item) {
  const channel = item?.channel;
  if (channel && liveMini?.prepareForRoom) {
    await liveMini.prepareForRoom(channel);
  }
  navigation.navigate(item?.isParty ? 'PartyRoom' : 'LiveRoom', item);
}
