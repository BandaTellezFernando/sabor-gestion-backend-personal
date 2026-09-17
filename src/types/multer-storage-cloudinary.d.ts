declare module 'multer-storage-cloudinary' {
  import { StorageEngine } from 'multer'
  import { v2 as CloudinaryType } from 'cloudinary'

  interface CloudinaryStorageOptions {
    cloudinary: typeof CloudinaryType
    params?: object
  }

  export class CloudinaryStorage implements StorageEngine {
    constructor(options: CloudinaryStorageOptions)
    _handleFile(
      req: Express.Request,
      file: Express.Multer.File,
      callback: (error?: Error | null, info?: object) => void
    ): void
    _removeFile(
      req: Express.Request,
      file: Express.Multer.File,
      callback: (error: Error | null) => void
    ): void
  }
}
