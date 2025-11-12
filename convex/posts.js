import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

// Get user's draft (there should only be one)
export const getUserDraft = query({
  handler: async (ctx) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);
    if (!user) throw new Error("Not authenticated");

    const draft = await ctx.db
      .query("posts")
      .filter((q) =>
        q.and(
          q.eq(q.field("authorId"), user._id),
          q.eq(q.field("status"), "draft")
        )
      )
      .unique();

    return draft;
  },
});

// Create new post
export const createPost = mutation({
  args: {
    title: v.string(),
    content: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    featuredImage: v.optional(v.string()),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);
    if (!user) throw new Error("Not authenticated");

    // First check if the draft is available, then update or published existing draft post
    const existingDraft = await ctx.db
      .query("posts")
      .filter((q) =>
        q.and(
          q.eq(q.field("authorId"), user._id),
          q.eq(q.field("status"), "draft")
        )
      )
      .unique();

    const now = Date.now();

    // If publishing and we have an existing draft → publish it
    if (args.status === "published" && existingDraft) {
      await ctx.db.patch(existingDraft._id, {
        title: args.title,
        content: args.content,
        status: "published",
        tags: args.tags || [],
        category: args.category,
        featuredImage: args.featuredImage,
        updatedAt: now,
        publishedAt: now,
        scheduledFor: args.scheduledFor,
      });

      return existingDraft._id;
    }

    // If saving a draft and we have existing draft → update it
    if (args.status === "draft" && existingDraft) {
      await ctx.db.patch(existingDraft._id, {
        title: args.title,
        content: args.content,
        tags: args.tags || [],
        category: args.category,
        featuredImage: args.featuredImage,
        scheduledFor: args.scheduledFor,
      });
      return existingDraft._id;
    }

    // Else → create new post
    const postId = await ctx.db.insert("posts", {
      title: args.title,
      content: args.content,
      status: args.status,
      authorId: user._id,
      tags: args.tags || [],
      category: args.category,
      featuredImage: args.featuredImage,
      createdAt: now,
      updatedAt: now,
      publishedAt: args.status === "published" ? now : undefined,
      scheduledFor: args.scheduledFor,
      viewCount: 0,
      likeCount: 0,
    });

    return postId;
  },
});

// Update the existing post
export const updatePost = mutation({
  args: {
    id: v.id("posts"),
    title: v.string(),
    content: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    tags: v.optional(v.array(v.string())),
    category: v.optional(v.string()),
    featuredImage: v.optional(v.string()),
    scheduledFor: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);
    if (!user) throw new Error("Not authenticated");

    // Get the post
    const post = await ctx.db.get(args.id);
    if (!post) {
      throw new Error("Post not found");
    }

    // Check if user owns the post
    if (post.authorId !== user._id) {
      throw new Error("Not authorized to update this post");
    }

    const now = Date.now();

    const updateDate = {
      updatedAt: now,
    };

    // Add provided field to update
    if (args.title !== undefined) updateDate.title = args.title;
    if (args.content !== undefined) updateDate.content = args.content;
    if (args.tags !== undefined) updateDate.tags = args.tags;
    if (args.category !== undefined) updateDate.category = args.category;
    if (args.featuredImage !== undefined)
      updateDate.featuredImage = args.featuredImage;
    if (args.scheduledFor !== undefined)
      updateDate.scheduledFor = args.scheduledFor;

    // Handle status change
    if (args.status !== undefined) {
      updateDate.status = args.status;

      if (args.status === "published" && post.status === "draft") {
        updateDate.publishedAt = now;
      }
    }

    await ctx.db.patch(args.id, updateDate);
    return args.id;
  },
});

// Get user's posts
export const getUserPosts = query({
  args: {
    status: v.optional(v.union(v.literal("draft"), v.literal("published"))),
  },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);

    if (!user) {
      return [];
    }

    let query = ctx.db
      .query("posts")
      .filter((q) => q.eq(q.field("authorId"), user._id));

    // Filter by status if provided
    if (args.status) {
      query = query.filter((q) => q.eq(q.field("status"), args.status));
    }

    const posts = await query.order("desc").collect();

    // Add username to each post
    return posts.map((post) => ({
      ...post,
      username: user.username,
    }));
  },
});

// Get a single post by ID
export const getById = query({
  args: { id: v.id("posts") },
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.users.getCurrentUser);

    return await ctx.db.get(args.id);
  },
});

// Delete a post
export const deletePost = mutation({
  args: { id: v.id("posts") },
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.users.getCurrentUser);
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Get the post
    const post = await ctx.db.get(args.id);
    if (!post) {
      throw new Error("Post not found");
    }

    // Check if user owns the post
    if (post.authorId !== user._id) {
      throw new Error("Not authorized to delete this post");
    }

    await ctx.db.delete(args.id);
    return { success: true };
  },
});
