// models/request.model.ts
export interface AccessCard {
    title: string;
    states: string; // Misalnya: 'approved', 'pending', 'rejected', dll.
    create_date: string; // Tanggal pembuatan
    access_card_status: string; // Status kartu akses
    access_card_end_date: string; // Tanggal akhir kartu akses
  }
  
  export interface OvernightParking {
    title: string;
    states: string;
    create_date: string;
    vehicle_number: string; // Nomor kendaraan
    approved_end_date: string; // Tanggal akhir yang disetujui
  }
  
  export interface BicycleTag {
    title: string;
    states: string;
    create_date: string;
    bicycle_tag: string; // Tag sepeda
    bicycle_brand: string; // Merek sepeda
  }
  
  export interface RegisteredCoach {
    title: string;
    states: string;
    create_date: string;
    coach_name: string; // Nama pelatih
    expected_start_date: string; // Tanggal mulai yang diharapkan
  }
  
  export interface RequestSchedule {
    title: string;
    states: string;
    create_date: string;
    schedule_type: string; // Jenis jadwal
    schedule_date: string; // Tanggal jadwal
  }
  
  export interface PetRegistration {
    title: string;
    states: string;
    create_date: string;
    type_of_pet: string; // Jenis hewan peliharaan
    pet_breed: string; // Ras hewan peliharaan
  }
  
  export interface Appeal {
    appeal_status: string; // Status banding
    title: string;
    is_appeal: boolean; // Apakah ini banding
    reason_for_appeal: string; // Alasan banding
  }
  
  // Gabungkan semua interface di atas menjadi satu interface untuk allDatas
  export type AllData = 
    | AccessCard
    | OvernightParking
    | BicycleTag
    | RegisteredCoach
    | RequestSchedule
    | PetRegistration
    | Appeal;