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
}