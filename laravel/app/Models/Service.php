<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Service extends Model
{
    use HasFactory;

    protected $fillable = [
        'title',
        'description',
        'processing_time',
        'fee'
    ];

    public function userRequests()
    {
        return $this->hasMany(UserRequest::class);
    }
}
