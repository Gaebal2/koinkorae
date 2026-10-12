export async function resolveSharedPost(data, id) {
  const post = (await data.postsById([id])).find(row => row.id === id);
  if (!post?.authorId) throw Error('missing');
  const profile = await data.profile(post.authorId);
  if (!profile) throw Error('missing');
  return {post, profile};
}
export function sharedPostStatus(page, id, pinnedId) {
  if (!id || id === pinnedId || page.items.some(post => post.id === id)) return 'found';
  if (page.error) return 'error';
  if (page.loading) return 'loading';
  return page.nextCursor ? 'more' : 'missing';
}
