<?php

namespace Database\Seeders;

use App\Models\Service;
use App\Models\User;
use App\Models\UserRequest;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class UserRequestSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        $users = User::where('role', 'user')->get();
        $services = Service::all();

        foreach ($users as $user) {
            foreach ($services->random(2) as $service) {
                UserRequest::create([
                    'user_id' => $user->id,
                    'service_id' => $service->id,
                    'status' => ['pending', 'in-progress', 'completed'][array_rand(['pending', 'in-progress', 'completed'])],
                ]);
            }
        }
    }
}
