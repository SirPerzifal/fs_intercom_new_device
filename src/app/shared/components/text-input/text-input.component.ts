import { Component, OnInit, Input, Output, EventEmitter, forwardRef } from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

@Component({
  selector: 'app-text-input',
  templateUrl: './text-input.component.html',
  styleUrls: ['./text-input.component.scss'],
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => TextInputComponent),
      multi: true
    }
  ]
})
export class TextInputComponent implements OnInit, ControlValueAccessor {
  @Input() placeholder: string = '';
  @Input() showPlaceholder: boolean = false;
  @Input() autoComplete: string = 'on'
  @Input() labelText: string = '';
  @Input() labelResidentText: string = '';
  @Input() labelResidentClass: string = '';
  @Input() type: string = 'text';
  @Input() customClasses: {[key: string]: boolean} = {};
  @Input() customInputClasses: {[key: string]: boolean} = {};
  @Input() textAreaClass: string = ''
  @Input() rows: number = 1
  @Input() id: string = '';
  @Input() name: string = '';
  @Input() isReadonly: boolean = false;
  @Input() min: string | null = null;
  @Input() max: string | null = null;

  @Output() valueChange = new EventEmitter<string>();
  @Output() keyupEvent = new EventEmitter<KeyboardEvent>();

  private _value: string = '';
  _displayValue: string = '';
  showDatePicker: boolean = false;
  isMonthPickerActive: boolean = false;

  // Tambahkan properti baru untuk menyimpan waktu
  private formatTimeForInput(time: string): string {
    return time; // Format waktu sesuai kebutuhan, jika perlu
  }

  private formatTimeForDisplay(time: string): string {
    return time; // Format waktu untuk ditampilkan, jika perlu
  }

  @Input() minTime: string | null = null; // Untuk batasan waktu minimum
  @Input() maxTime: string | null = null; // Untuk batasan waktu maksimum

  @Input()
  set value(val: string | Date) {
    if (this.type === 'month') {
      this._value = val?.toString() || '';
      this._displayValue = this._value;
    }else if (this.type === 'date') {
      if (val instanceof Date) {
        this._value = this.formatDateForInput(val);
        this._displayValue = this.formatDateForDisplay(val);
      } else if (val) {
        const date = new Date(val);
        if (!isNaN(date.getTime())) {
          this._value = this.formatDateForInput(date);
          this._displayValue = this.formatDateForDisplay(date);
        }
      }
    } else if (this.type === 'time') {
      this._value = val?.toString() || '';
      this._displayValue = this._value ? this.formatTimeForDisplay(this._value) : this.placeholder; // Show placeholder if no value
      this.onChange(this._value);
      this.valueChange.emit(this._value);
    } else {
      this._value = val?.toString() || '';
      this._displayValue = this._value;
    }
    
    this.onChange(this._value);
    this.valueChange.emit(this._value);
  }

  get value(): string {
    return this.type === 'date' ? this._displayValue : this._value;
  }

  get hiddenDateValue(): string {
    return this._value;
  }

  private formatDateForInput(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private formatDateForDisplay(date: Date): string {
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  }

  onDateInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.value) {
      const date = new Date(input.value);
      this._value = this.formatDateForInput(date);
      this._displayValue = this.formatDateForDisplay(date);
      this.onChange(this._value);
      this.valueChange.emit(this._value);
    }
  }

  onDisplayInputClick(): void {
    if (this.type === 'date' && !this.isReadonly) {
      this.showDatePicker = true;
          
      // Gunakan delay yang lebih lama untuk iOS
      setTimeout(() => {
        const dateInput = document.getElementById(`${this.id}-date-picker`) as HTMLInputElement;
        if (dateInput) {
          // Pastikan element visible sementara
          dateInput.style.position = 'fixed';
          dateInput.style.top = '50%';
          dateInput.style.left = '50%';
          dateInput.style.opacity = '0.01'; // Hampir invisible tapi masih detectable
          dateInput.style.pointerEvents = 'auto';
          
          try {
            dateInput.focus();
            dateInput.showPicker();
          } catch (e) {
            // Fallback: trigger click event
            dateInput.click();
          }
          
          // Kembalikan ke hidden setelah picker terbuka
          setTimeout(() => {
            dateInput.style.position = 'absolute';
            dateInput.style.opacity = '0';
            dateInput.style.pointerEvents = 'none';
          }, 100);
        }
      }, 100); // Delay lebih lama untuk iOS
    }
    if (this.type === 'time' && !this.isReadonly) {
      // Logic to open the time picker
      const timeInput = document.getElementById(`${this.id}`) as HTMLInputElement;
      if (timeInput) {
        timeInput.showPicker(); // This will open the time picker
      }
    }
  }

  onChange: (value: string) => void = () => {};
  onTouched: () => void = () => {};

  writeValue(value: string): void {
    if (value) {
      this.value = value;
    } else {
      this._value = '';
      this._displayValue = '';
    }
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState?(isDisabled: boolean): void {
    // Handle input disabling if needed
  }

  

  constructor() { }

  getFilteredClasses(classes: { [key: string]: boolean }) {
    return Object.keys(classes).filter(cls => classes[cls]);
  }

  getFilteredCustomClasses(classes: { [key: string]: boolean }) {
    return Object.keys(classes).filter(cls => classes[cls]);
  }

  reset() {
    this._value = '';
    this._displayValue = '';
    this.onChange('');
    this.valueChange.emit('');
  }

  showMonthPicker() {
    if (!this.isReadonly) {
      this.isMonthPickerActive = true;
      setTimeout(() => {
        const monthInput = document.getElementById(this.id) as HTMLInputElement;
        if (monthInput) {
          monthInput.showPicker();
          // Hide picker and show display input when the picker is closed
          monthInput.addEventListener('blur', () => {
            this.isMonthPickerActive = false;
          }, { once: true });
        }
      }, 0);
    }
  }

  // Add method to handle month type specifically
  clearMonthInput() {
    this._value = '';
    this._displayValue = '';
    this.isMonthPickerActive = false;
    this.onChange('');
    this.valueChange.emit('');
  }

  onMonthInputChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this._value = input.value;
    // Format the display value as needed
    const date = new Date(input.value + '-01'); // Add day for proper date parsing
    const month = date.toLocaleString('default', { month: 'long' });
    const year = date.getFullYear();
    this._displayValue = `${month} ${year}`;
    this.onChange(this._value);
    this.valueChange.emit(this._value);
    this.isMonthPickerActive = false;
  }

  ngOnInit() {}

  onKeyUp(event: KeyboardEvent): void {
    if (this.type !== 'date') {
      const inputValue = (event.target as HTMLInputElement).value;
      this._value = inputValue;
      this._displayValue = inputValue;
      this.keyupEvent.emit(event);
      this.valueChange.emit(this._value);
      this.onChange(this._value);
    } else {
      this._value = (event.target as HTMLInputElement).value;
      this.keyupEvent.emit(event);
      // Emit value baru
      this.valueChange.emit(this._value);
      this.onChange(this._value); 
    }
  }
}