export interface NewNoticeForm {
    notice_title: string;
    notice_content: string;
    notice_attachment: string;
    post_to: string;
    unit_ids: number[]; // Ubah ini menjadi array of numbers
    block_ids: number[]; // Ubah ini menjadi array of numbers
    start_time: Date;
    end_time: Date;
    project_id: number;
}
