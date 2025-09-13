<?php

namespace Database\Seeders;

use App\Models\Service;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class ServiceSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $services = [
            [
                'title' => 'Passport Application',
                'description' => 'Apply for a new passport or renew an existing one.',
                'processing_time' => '10-15 Business Days',
                'fee' => 50.00,
            ],
            [
                'title' => 'Birth Certificate',
                'description' => 'Request a copy of your birth certificate.',
                'processing_time' => '5-7 Business Days',
                'fee' => 15.00,
            ],
            [
                'title' => 'Driver’s License Renewal',
                'description' => 'Renew your driver’s license online.',
                'processing_time' => '3-5 Business Days',
                'fee' => 25.00,
            ],
            [
                'title' => 'Tax Filing Assistance',
                'description' => 'Get assistance with filing your taxes for the year.',
                'processing_time' => '7-10 Business Days',
                'fee' => 0.00,
            ],
            [
                'title' => 'Marriage Certificate',
                'description' => 'Request a certified copy of your marriage certificate.',
                'processing_time' => '7-14 Business Days',
                'fee' => 20.00,
            ],
        ];

        foreach ($services as $service) {
            Service::create($service);
        }
    }
}
