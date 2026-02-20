import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpEventType } from '@angular/common/http';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  private http = inject(HttpClient);

  apiUrl = environment.apiUrl;
  allowedExtensions = ['.mp3', '.wav', '.flac'];

  dragOver = false;
  progress = 0;
  status: 'idle' | 'uploading' | 'done' | 'error' = 'idle';
  errorMessage = '';
  downloadUrl: string | null = null;
  downloadFilename = 'converted-432.mp3';

  onDragOver(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragOver = true;
  }

  onDragLeave(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragOver = false;
  }

  onDrop(e: DragEvent): void {
    e.preventDefault();
    e.stopPropagation();
    this.dragOver = false;

    const files = e.dataTransfer?.files;
    if (!files?.length) return;

    const file = files[0];
    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
    if (!this.allowedExtensions.includes(ext)) {
      this.status = 'error';
      this.errorMessage = `Invalid file type. Use ${this.allowedExtensions.join(', ')}.`;
      return;
    }

    this.upload(file);
  }

  onFileSelected(e: Event): void {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
    if (!this.allowedExtensions.includes(ext)) {
      this.status = 'error';
      this.errorMessage = `Invalid file type. Use ${this.allowedExtensions.join(', ')}.`;
      return;
    }

    this.upload(file);
  }

  upload(file: File): void {
    this.status = 'uploading';
    this.progress = 0;
    this.errorMessage = '';
    this.downloadUrl = null;

    const formData = new FormData();
    formData.append('file', file);

    this.http
      .post(`${this.apiUrl}/convert`, formData, {
        reportProgress: true,
        observe: 'events',
        responseType: 'blob',
      })
      .subscribe({
        next: (event) => {
          if (event.type === HttpEventType.UploadProgress && event.total) {
            this.progress = Math.round((100 * event.loaded) / event.total);
          } else if (event.type === HttpEventType.Response && event.body) {
            this.progress = 100;
            this.status = 'done';
            this.downloadUrl = URL.createObjectURL(event.body);
          }
        },
        error: (err) => {
          this.status = 'error';
          this.progress = 0;
          if (err.error instanceof Blob) {
            err.error.text().then((t: string) => {
              try {
                const j = JSON.parse(t);
                this.errorMessage = j.error || j.detail || 'Conversion failed.';
              } catch {
                this.errorMessage = 'Conversion failed.';
              }
            });
          } else {
            this.errorMessage = err.message || 'Conversion failed.';
          }
        },
      });
  }

  reset(): void {
    if (this.downloadUrl) URL.revokeObjectURL(this.downloadUrl);
    this.downloadUrl = null;
    this.status = 'idle';
    this.progress = 0;
    this.errorMessage = '';
  }
}
