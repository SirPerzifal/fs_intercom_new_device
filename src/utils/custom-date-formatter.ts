// src/app/services/custom-date-formatter.ts
import { CalendarDateFormatter, DateFormatterParams } from 'angular-calendar';
import { formatDate } from '@angular/common';
import { Injectable } from '@angular/core';

@Injectable()
export class CustomDateFormatter extends CalendarDateFormatter {
  // Override methods with the 'override' modifier
  override monthViewColumnHeader({ date, locale }: DateFormatterParams): string {
    return formatDate(date, 'EEE', locale || 'en-US'); // Provide a default locale
  }

  override monthViewTitle({ date, locale }: DateFormatterParams): string {
    return formatDate(date, 'MMM y', locale || 'en-US'); // Provide a default locale
  }

  override weekViewColumnHeader({ date, locale }: DateFormatterParams): string {
    return formatDate(date, 'EEE', locale || 'en-US'); // Provide a default locale
  }

  override dayViewHour({ date, locale }: DateFormatterParams): string {
    return formatDate(date, 'HH:mm', locale || 'en-US'); // Provide a default locale
  }
}