import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { SupabaseClient } from '../supabase-client.js';

export function getStorageTools(): Tool[] {
  return [
    {
      name: 'storage_list_buckets',
      description: 'List all storage buckets',
      inputSchema: {
        type: 'object',
        properties: {},
      },
    },
    {
      name: 'storage_create_bucket',
      description: 'Create a new storage bucket',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Bucket name',
          },
          public: {
            type: 'boolean',
            description: 'Whether the bucket is public (default: false)',
            default: false,
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'storage_delete_bucket',
      description: 'Delete a storage bucket',
      inputSchema: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Bucket name to delete',
          },
        },
        required: ['name'],
      },
    },
    {
      name: 'storage_list_files',
      description: 'List files in a storage bucket',
      inputSchema: {
        type: 'object',
        properties: {
          bucket: {
            type: 'string',
            description: 'Bucket name',
          },
          path: {
            type: 'string',
            description: 'Path within bucket (default: root)',
            default: '',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of files to return',
          },
        },
        required: ['bucket'],
      },
    },
    {
      name: 'storage_upload_file',
      description: 'Upload a file to storage (base64 encoded)',
      inputSchema: {
        type: 'object',
        properties: {
          bucket: {
            type: 'string',
            description: 'Bucket name',
          },
          path: {
            type: 'string',
            description: 'File path in bucket',
          },
          file_base64: {
            type: 'string',
            description: 'Base64 encoded file content',
          },
          content_type: {
            type: 'string',
            description: 'MIME type of the file',
          },
        },
        required: ['bucket', 'path', 'file_base64'],
      },
    },
    {
      name: 'storage_download_file',
      description: 'Download a file from storage',
      inputSchema: {
        type: 'object',
        properties: {
          bucket: {
            type: 'string',
            description: 'Bucket name',
          },
          path: {
            type: 'string',
            description: 'File path in bucket',
          },
        },
        required: ['bucket', 'path'],
      },
    },
    {
      name: 'storage_delete_file',
      description: 'Delete a file from storage',
      inputSchema: {
        type: 'object',
        properties: {
          bucket: {
            type: 'string',
            description: 'Bucket name',
          },
          paths: {
            type: 'array',
            description: 'Array of file paths to delete',
            items: {
              type: 'string',
            },
          },
        },
        required: ['bucket', 'paths'],
      },
    },
    {
      name: 'storage_get_public_url',
      description: 'Get public URL for a file',
      inputSchema: {
        type: 'object',
        properties: {
          bucket: {
            type: 'string',
            description: 'Bucket name',
          },
          path: {
            type: 'string',
            description: 'File path in bucket',
          },
        },
        required: ['bucket', 'path'],
      },
    },
  ];
}

export async function handleStorageTool(
  supabaseClient: SupabaseClient,
  name: string,
  args: any
): Promise<CallToolResult> {
  const client = supabaseClient.getAdminClient();

  switch (name) {
    case 'storage_list_buckets': {
      try {
        const { data, error } = await client.storage.listBuckets();

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  operation: 'list_buckets',
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'list_buckets',
                buckets: data || [],
                count: data?.length || 0,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                operation: 'list_buckets',
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'storage_create_bucket': {
      const { name: bucketName, public: isPublic = false } = args;
      
      try {
        const { data, error } = await client.storage.createBucket(bucketName, {
          public: isPublic,
        });

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  operation: 'create_bucket',
                  bucket: bucketName,
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'create_bucket',
                bucket: bucketName,
                public: isPublic,
                data: data,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                operation: 'create_bucket',
                bucket: bucketName,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'storage_delete_bucket': {
      const { name: bucketName } = args;
      
      try {
        const { data, error } = await client.storage.deleteBucket(bucketName);

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  operation: 'delete_bucket',
                  bucket: bucketName,
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'delete_bucket',
                bucket: bucketName,
                data: data,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                operation: 'delete_bucket',
                bucket: bucketName,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'storage_list_files': {
      const { bucket, path = '', limit } = args;
      
      try {
        const { data, error } = await client.storage
          .from(bucket)
          .list(path, { limit });

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  operation: 'list_files',
                  bucket,
                  path,
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'list_files',
                bucket,
                path,
                files: data || [],
                count: data?.length || 0,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                operation: 'list_files',
                bucket,
                path,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'storage_upload_file': {
      const { bucket, path, file_base64, content_type } = args;
      
      try {
        // Decode base64
        const fileBuffer = Buffer.from(file_base64, 'base64');
        
        const { data, error } = await client.storage
          .from(bucket)
          .upload(path, fileBuffer, {
            contentType: content_type,
            upsert: true,
          });

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  operation: 'upload_file',
                  bucket,
                  path,
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'upload_file',
                bucket,
                path,
                data: data,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                operation: 'upload_file',
                bucket,
                path,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'storage_download_file': {
      const { bucket, path } = args;
      
      try {
        const { data, error } = await client.storage
          .from(bucket)
          .download(path);

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  operation: 'download_file',
                  bucket,
                  path,
                }, null, 2),
              },
            ],
          };
        }

        // Convert blob to base64 for transmission
        const arrayBuffer = await data.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const base64Content = buffer.toString('base64');

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'download_file',
                bucket,
                path,
                file_base64: base64Content,
                size: buffer.length,
                note: 'File content is base64 encoded',
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                operation: 'download_file',
                bucket,
                path,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'storage_delete_file': {
      const { bucket, paths } = args;
      
      try {
        const { data, error } = await client.storage
          .from(bucket)
          .remove(paths);

        if (error) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  error: error.message,
                  operation: 'delete_file',
                  bucket,
                  paths,
                }, null, 2),
              },
            ],
          };
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'delete_file',
                bucket,
                paths,
                deleted: data || [],
                count: data?.length || 0,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                operation: 'delete_file',
                bucket,
                paths,
              }, null, 2),
            },
          ],
        };
      }
    }

    case 'storage_get_public_url': {
      const { bucket, path } = args;
      
      try {
        const { data } = client.storage
          .from(bucket)
          .getPublicUrl(path);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                operation: 'get_public_url',
                bucket,
                path,
                public_url: data.publicUrl,
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : String(error),
                operation: 'get_public_url',
                bucket,
                path,
              }, null, 2),
            },
          ],
        };
      }
    }

    default:
      throw new Error(`Unknown storage tool: ${name}`);
  }
}