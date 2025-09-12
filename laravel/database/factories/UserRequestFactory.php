<?php

namespace Database\Factories;

use App\Models\Service;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\UserRequest>
 */
class UserRequestFactory extends Factory
{
    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'user_id' => User::where('role', 'user')->inRandomOrder()->first()->id,
            'service_id' => Service::inRandomOrder()->first()->id,
            'status' => $this->faker->randomElement(['pending', 'in-progress', 'completed', 'rejected']),
        ];
    }
}
