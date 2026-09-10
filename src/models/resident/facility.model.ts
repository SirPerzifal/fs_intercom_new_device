export interface Facility {
  facility_id: number;
  facility_name: string;
  total_facilities: number;
  facility_banner: string;
}

export interface BookingData {
  facility_name: string;
  event_date: string;
  start_time: string;
  end_time: string;
  booking_fee: number;
  deposit: number;
  booked_by: string;
  status: string;
}

export interface BookingDetails {
  roomId: string; // Ubah ke number jika perlu
  startTimeString: string;
  endTimeString: string;
  unitId: number;
  partnerId: number;
  bookingFee: number;
  deposit: number;
  eventDate: string;
  bookingTime: string;
  facilityName: string;
  booking_id: string;
}

export interface ActiveBooking {
  id: number;
  facilityName: string;
  eventDate: string;
  startTime: string;
  endTime: string;
  bookedBy: string;
  statusBooked: string;
  amountUntaxed: string,
  amount_taxed: string,
  amount_total: string,
  amount_deposit: number,
}

// Tambahkan interface ini di bagian atas file TypeScript Anda
export interface BookingResponse {
  id: number;
  facility_name: string;
  booking_date: string;
  start_datetime: string;
  stop_datettime: string;
  booked_by: string;
  booking_status: string;
  amount_untaxed: string,
  amount_taxed: string,
  amount_total: string,
  amount_deposit: string,
}