"use client";

import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import z from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useConvexMutation } from "@/hooks/useConvexQuery";
import { api } from "@/convex/_generated/api";
import { useRouter } from "next/navigation";
import PostEditorHeader from "./PostEditorHeader";
import PostEditorContent from "./PostEditorContent";
import PostEditorSettings from "./PostEditorSettings";
import { toast } from "sonner";
import ImageUploadModal from "./ImageUploadModal";

const postSchema = z.object({
  title: z.string().min(1, "Title is required").max(200, "Title too long"),
  content: z.string().min(1, "Content is required"),
  category: z.string().optional(),
  tags: z.array(z.string()).max(10, "Maximum 10 tags allowed"),
  featuredImage: z.string().optional(),
  scheduleFor: z.string().optional(),
});

const PostEditor = ({ initialData = null, mode = "create" }) => {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImageModalOpen, setIsImageModalOpen] = useState(false);
  const [imageModalType, setImageModalType] = useState("featured");
  const [quillRef, setQuillRef] = useState(null);

  const router = useRouter();

  const { mutate: createPost, isLoading: isCreateLoading } = useConvexMutation(
    api.posts.createPost
  );

  const { mutate: updatePost, isLoading: isUpdating } = useConvexMutation(
    api.posts.updatePost
  );

  const form = useForm({
    resolver: zodResolver(postSchema),
    defaultValues: {
      title: initialData?.title || "",
      content: initialData?.content || "",
      category: initialData?.category || "",
      tags: initialData?.tags || [],
      featuredImage: initialData?.featuredImage || "",
      scheduleFor: initialData?.scheduleFor
        ? new Date(initialData.scheduleFor).toISOString().slice(0, 16)
        : "",
    },
  });

  const { handleSubmit, watch, setValue } = form;
  const watchedValues = watch();

  // Auto save for draft
  useEffect(() => {
    if (!watchedValues.title && !watchedValues.content) return;

    const autoSave = setInterval(() => {
      if (watchedValues.title && watchedValues.content) {
        if (mode === "create") handleSave(true); // Silent save
      }
    }, 30000);

    return () => clearInterval(autoSave);
  }, [watchedValues.title, watchedValues.content]);

  const onSubmit = async (data, action, silent = false) => {
    try {
      const postData = {
        title: data.title,
        content: data.content,
        category: data.category || undefined,
        tags: data.tags,
        featuredImage: data.featuredImage,
        status: action === "publish" ? "published" : "draft",
        scheduledFor: data.scheduledFor
          ? new Date(data.scheduledFor).getTime()
          : undefined,
      };

      let resultId;

      if (mode === "edit" && initialData?._id) {
        // Always use update for edit mode
        resultId = await updatePost({
          id: initialData._id,
          ...postData,
        });
      } else if (initialData?._id && action === "draft") {
        // If we have existing draft data, update it
        resultId = await updatePost({
          id: initialData._id,
          ...postData,
        });
      } else {
        // Create new post (will auto-update existing draft if needed)
        resultId = await createPost(postData);
      }

      if (!silent) {
        const message =
          action === "publish" ? "Post published!" : "Draft saved!";
        toast.success(message);
        if (action === "publish") router.push("/dashboard/posts");
      }
      return resultId;
    } catch (error) {
      if (!silent) toast.error(error.message || "Failed to save post");
      throw error;
    }
  };

  const handleSave = (silent = false) => {
    handleSubmit((data) => onSubmit(data, "draft", silent))();
  };

  const handlePublish = () => {
    handleSubmit((data) => onSubmit(data, "publish"))();
  };

  const handleSchedule = () => {
    if (!watchedValues.scheduleFor) {
      toast.error("Please select a date and time for schedule");
      return;
    }
    handleSubmit((data) => onSubmit(data, "schedule"))();
  };

  const handleImageSelect = (imageData) => {}

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <PostEditorHeader
        mode={mode}
        initialData={initialData}
        isPublishing={isCreateLoading || isUpdating}
        onSave={handleSave}
        onPublish={handlePublish}
        onSchedule={handleSchedule}
        onSettingsOpen={() => setIsSettingsOpen(true)}
        onBack={() => router.push("/dashboard")}
      />

      {/* Editor */}
      <PostEditorContent
        form={form}
        setQuillRef={setQuillRef}
        onImageUpload={(type) => {
          setImageModalType(type);
          setIsImageModalOpen(true);
        }}
      />

      {/* Setting Dialog */}
      <PostEditorSettings
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        form={form}
        mode={mode}
      />

      {/* Image Upload Dialog */}
      <ImageUploadModal 
        isOpen={isImageModalOpen}
        onClose={() => setIsImageModalOpen(false)}
        onImageSelect={handleImageSelect}
        title={
          imageModalType === "featured" ? "Upload Featured Image" : "Insert Image"
        }
      />
    </div>
  );
};

export default PostEditor;
